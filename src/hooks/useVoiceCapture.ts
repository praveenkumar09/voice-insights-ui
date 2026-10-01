import { useCallback, useRef, useState } from 'react'
import { updateLifeMap, updateTranscript, wsVoiceUrl } from '../api/client'
import type { CopilotInsights, CustomerProfile, LifeMapData, SignalPoint } from '../types'

export type VoiceCaptureStatus = 'idle' | 'connecting' | 'listening' | 'paused' | 'stopping' | 'stopped' | 'error'

/** live: the customer is speaking. debrief: the advisor dictates a summary after the meeting. */
export type CaptureMode = 'live' | 'debrief'

interface VoiceMessage {
  type: string
  [key: string]: unknown
}

// The realtime transcription service takes 24kHz PCM16. The audio context is
// asked to run at that rate natively (high-quality browser resampling); the
// worklet (public/pcm-worklet.js) resamples itself if the browser refuses.
const TARGET_SAMPLE_RATE = 24000

export function useVoiceCapture() {
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle')
  const [amplitude, setAmplitude] = useState(0)
  const [partialText, setPartialText] = useState('')
  const [finalSegments, setFinalSegments] = useState<string[]>([])
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [copilot, setCopilot] = useState<CopilotInsights | null>(null)
  const [signalHistory, setSignalHistory] = useState<SignalPoint[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const statusRef = useRef<VoiceCaptureStatus>('idle')
  const readyRef = useRef(false)
  statusRef.current = status
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioWorkletNode | null>(null)
  const sinkRef = useRef<GainNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const cleanupAudio = useCallback(() => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    sinkRef.current?.disconnect()
    sinkRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioContextRef.current?.close().catch(() => {})
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    setAmplitude(0)
  }, [])

  /** Opens the microphone and streams 24kHz PCM to an open voice websocket (used by start and by resume). */
  const attachMic = useCallback(
    async (ws: WebSocket) => {
      // Browser defaults (noise suppression on) treat soft, quick consonants as
      // noise and cut them. Keep echo cancellation (agent may use speakers) and
      // auto-gain (lifts quiet voices) but turn noise suppression off.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      })
      streamRef.current = stream

      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      let audioContext: AudioContext
      try {
        audioContext = new AudioContextCtor({ sampleRate: TARGET_SAMPLE_RATE, latencyHint: 'interactive' })
      } catch {
        audioContext = new AudioContextCtor({ latencyHint: 'interactive' })
      }
      audioContextRef.current = audioContext
      // Chrome can leave a context created after an awaited permission prompt in
      // 'suspended' — onaudioprocess then never fires and no audio is ever sent.
      if (audioContext.state === 'suspended') await audioContext.resume()

      await audioContext.audioWorklet.addModule('/pcm-worklet.js')
      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source
      const worklet = new AudioWorkletNode(audioContext, 'pcm-worklet', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
      processorRef.current = worklet

      worklet.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; amp: number }>) => {
        setAmplitude(e.data.amp)
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data.pcm)
      }

      // Some browsers only pull audio through nodes that reach the destination;
      // a muted sink keeps the graph alive without playing the mic back.
      const sink = audioContext.createGain()
      sink.gain.value = 0
      sinkRef.current = sink
      source.connect(worklet)
      worklet.connect(sink)
      sink.connect(audioContext.destination)
    },
    [],
  )

  const start = useCallback(
    async (mode: CaptureMode = 'live') => {
      setErrorMessage(null)
      setPartialText('')
      setFinalSegments([])
      setProfile(null)
      setCopilot(null)
      setSignalHistory([])
      setStatus('connecting')

      try {
        const ws = new WebSocket(wsVoiceUrl(mode))
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data as string) as VoiceMessage
          switch (msg.type) {
            case 'ready':
              // The transcription service has confirmed the session — only now is it safe to start talking.
              readyRef.current = true
              if (statusRef.current === 'connecting') setStatus('listening')
              break
            case 'session_started':
              setProfile((p) => ({ ...(p ?? {}), id: msg.customerProfileId as string, captureMode: mode === 'debrief' ? 'DEBRIEF' : 'LIVE' }))
              break
            case 'partial_transcript':
              setPartialText(msg.text as string)
              break
            case 'final_transcript':
              setFinalSegments((segs) => [...segs, msg.text as string])
              setPartialText('')
              break
            case 'profile':
              setProfile(msg.profile as CustomerProfile)
              break
            case 'copilot': {
              const c = msg.copilot as CopilotInsights
              setCopilot(c)
              setSignalHistory((h) => [...h, { sentiment: c.sentiment.score, buying: c.buyingSignal.score }])
              break
            }
            case 'session_ended':
              setStatus('stopped')
              ws.close()
              break
            case 'error':
              setErrorMessage(msg.message as string)
              break
          }
        }

        ws.onerror = () => setErrorMessage('Voice connection error')
        ws.onclose = () => {
          // A close while the advisor is mid-dictation (not part of finishing) means the take cannot continue.
          if (statusRef.current === 'paused' || statusRef.current === 'listening') {
            cleanupAudio()
            setErrorMessage('The connection closed — what you dictated so far is kept, but you will need to start a new session.')
            setStatus('error')
          }
        }

        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve()
          setTimeout(() => reject(new Error('Connection to voice service timed out')), 8000)
        })

        readyRef.current = false
        await attachMic(ws)
        // Stay on "Connecting" until the server says the transcription session is live; if that message never
        // comes (older server, slow network) fall back after a few seconds rather than hang.
        if (readyRef.current) setStatus('listening')
        else setTimeout(() => statusRef.current === 'connecting' && setStatus('listening'), 6000)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to start voice capture')
        setStatus('error')
        cleanupAudio()
      }
    },
    [attachMic, cleanupAudio],
  )

  /** Back to a clean slate (e.g. when the advisor switches mode): releases the mic, closes the session, clears the screen. */
  const reset = useCallback(() => {
    statusRef.current = 'idle'
    cleanupAudio()
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close()
    setPartialText('')
    setFinalSegments([])
    setProfile(null)
    setCopilot(null)
    setSignalHistory([])
    setErrorMessage(null)
    setStatus('idle')
  }, [cleanupAudio])

  /** Pause: release the microphone but keep the session open, so the advisor can dictate in several takes. */
  const pause = useCallback(() => {
    cleanupAudio()
    const ws = wsRef.current
    // Ask the server to finalize what it has heard — a paused browser sends no trailing silence for it to detect.
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'commit' }))
    setStatus('paused')
  }, [cleanupAudio])

  const resume = useCallback(async () => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErrorMessage('The session is no longer connected — start a new one.')
      setStatus('error')
      return
    }
    try {
      setErrorMessage(null)
      await attachMic(ws)
      setStatus('listening')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not reopen the microphone')
    }
  }, [attachMic])

  const stop = useCallback(() => {
    setStatus('stopping')
    cleanupAudio()
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
  }, [cleanupAudio])

  /**
   * Saves an agent-corrected transcript: the server re-extracts the profile and
   * re-runs the live analysis from the edited text, and everything on screen
   * (transcript, profile, signals, matches) is replaced with the result so the
   * final recommendations are built from the corrected conversation.
   */
  const saveTranscriptEdit = useCallback(
    async (text: string) => {
      const id = profile?.id
      if (!id) throw new Error('No active session to update')
      const result = await updateTranscript(id, text)
      setFinalSegments(text.split(/\n+/).map((t) => t.trim()).filter(Boolean))
      setPartialText('')
      setProfile(result.profile)
      if (result.copilot) {
        setCopilot(result.copilot)
        setSignalHistory([{ sentiment: result.copilot.sentiment.score, buying: result.copilot.buyingSignal.score }])
      }
    },
    [profile?.id],
  )

  /** Saves the advisor's corrections to the Life Map; the server looks up protection ideas for anything new. */
  const saveLifeMapEdit = useCallback(
    async (map: LifeMapData) => {
      const id = profile?.id
      if (!id) throw new Error('No active session to update')
      setCopilot(await updateLifeMap(id, map))
    },
    [profile?.id],
  )

  /** Applies edits made on the review form (name, budget, existing cover, …) to the profile held on screen. */
  const patchProfile = useCallback((patch: Partial<CustomerProfile>) => setProfile((p) => ({ ...(p ?? {}), ...patch })), [])

  return {
    status, amplitude, partialText, finalSegments, profile, copilot, signalHistory, errorMessage,
    start, stop, pause, resume, reset, saveTranscriptEdit, saveLifeMapEdit, patchProfile,
  }
}

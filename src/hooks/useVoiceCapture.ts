import { useCallback, useRef, useState } from 'react'
import { updateLifeMap, updateTranscript, wsVoiceUrl } from '../api/client'
import type { CopilotInsights, CustomerProfile, LifeMapData, SignalPoint } from '../types'

export type VoiceCaptureStatus = 'idle' | 'connecting' | 'listening' | 'paused' | 'stopping' | 'stopped' | 'error'

/** live: the customer is speaking. debrief: the advisor dictates a summary after the meeting. juno-debrief: the same, then Juno asks the advisor about the gaps. */
export type CaptureMode = 'live' | 'debrief' | 'juno-debrief'

/** How firmly background sound (a TV, other conversations) is kept out: off, normal, or strong. */
export type NoiseFilter = 'off' | 'normal' | 'strong'
const FILTER_KEY = 'vi_noise_filter'
const REF_KEY = 'vi_voice_level'

function storedLevel(): number | null {
  try {
    const v = parseFloat(localStorage.getItem(REF_KEY) ?? '')
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
const FILTER_RATIO: Record<NoiseFilter, number> = { off: 0, normal: 0.35, strong: 0.5 }

function storedFilter(): NoiseFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY)
    return v === 'off' || v === 'strong' ? v : 'normal'
  } catch {
    return 'normal'
  }
}

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
  const [noiseFilter, setNoiseFilterState] = useState<NoiseFilter>(storedFilter)
  const [backgroundIgnored, setBackgroundIgnored] = useState(false)
  const noiseFilterRef = useRef<NoiseFilter>(noiseFilter)
  noiseFilterRef.current = noiseFilter
  const gatedRun = useRef(0)
  // While Juno is speaking aloud the microphone must not feed its own voice back into the transcript.
  const mutedRef = useRef(false)
  // While muted (Juno speaking) the microphone is still measured, and the last fraction of a second of audio is held, so a
  // customer who interrupts is heard from their first word. Nothing held is sent unless an interruption is confirmed.
  const heldRef = useRef<ArrayBuffer[]>([])
  const rawListener = useRef<((amp: number) => void) | null>(null)
  const lastSavedLevel = useRef(0)

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
    gatedRun.current = 0
    setBackgroundIgnored(false)
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
        // Browser auto-gain is off: it lifts a quiet TV exactly when nobody is speaking, which defeats the background
        // filter. The audio worklet applies its own gentle gain (after the filter has judged the raw level).
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false },
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

      await audioContext.audioWorklet.addModule('/pcm-worklet.js?v=6')
      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source
      const worklet = new AudioWorkletNode(audioContext, 'pcm-worklet', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
      processorRef.current = worklet

      worklet.port.postMessage({ gate: noiseFilterRef.current !== 'off', ratio: FILTER_RATIO[noiseFilterRef.current] || 0.35, ref: storedLevel() ?? undefined })
      worklet.port.onmessage = (e: MessageEvent<{ pcm?: ArrayBuffer; amp: number; gated?: boolean; ref?: number }>) => {
        setAmplitude(mutedRef.current ? 0 : e.data.amp)
        rawListener.current?.(e.data.amp)
        // Remember how loud this advisor typically speaks, so the next session starts calibrated to them.
        if (e.data.ref && Date.now() - lastSavedLevel.current > 4000) {
          lastSavedLevel.current = Date.now()
          try {
            localStorage.setItem(REF_KEY, String(e.data.ref))
          } catch {
            // Not remembering is fine.
          }
        }
        // Say so when background is being ignored for a while, so a quiet speaker can tell the filter is acting.
        gatedRun.current = e.data.gated ? gatedRun.current + 1 : 0
        setBackgroundIgnored((was) => (gatedRun.current >= 12 ? true : gatedRun.current === 0 ? false : was))
        if (e.data.pcm) {
          if (mutedRef.current) {
            heldRef.current.push(e.data.pcm)
            if (heldRef.current.length > 8) heldRef.current.shift()
          } else if (ws.readyState === WebSocket.OPEN) {
            ws.send(e.data.pcm)
          }
        }
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

  /** Stops (or resumes) sending the microphone to the server — used so Juno never transcribes its own voice. */
  const setMicMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted
    if (muted) setAmplitude(0)
    else heldRef.current = []
    // The background filter stops learning the speaker's level while Juno speaks (its voice reaches the mic through the speakers).
    processorRef.current?.port.postMessage({ learn: !muted })
  }, [])

  /** Calls back with the real microphone level (0..1) even while muted — used to notice an interruption. */
  const setRawAmpListener = useCallback((fn: ((amp: number) => void) | null) => {
    rawListener.current = fn
  }, [])

  /** An interruption was confirmed: send the last fraction of a second that was held (the customer's first words), then listen normally. */
  const releaseHeld = useCallback((lastChunks = 4) => {
    const ws = wsRef.current
    const held = heldRef.current.slice(-lastChunks)
    heldRef.current = []
    if (ws && ws.readyState === WebSocket.OPEN) held.forEach((c) => ws.send(c))
    mutedRef.current = false
    processorRef.current?.port.postMessage({ learn: true })
  }, [])

  /** Stops the background filter learning the speaker's level (while something other than the customer is playing). */
  const setLearning = useCallback((on: boolean) => {
    if (on && mutedRef.current) return // never start learning again while Juno is the one speaking
    processorRef.current?.port.postMessage({ learn: on })
  }, [])

  /** Tells the server what Juno just said, so it sits in the transcript beside the customer's answer. */
  const sendAgentSay = useCallback((text: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'agent_say', text }))
  }, [])

  /** Tells the server which language the conversation is in, so the speech model knows what to expect. */
  const sendLanguage = useCallback((lang: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'language', lang }))
  }, [])

  /**
   * Switches the server to conversational timing (short answers are kept, each answer ends on the browser's commit).
   * Used after the advisor hands over to Juno: dictation keeps the stricter settings of the normal debrief, so a
   * silence or a breath is never turned into words.
   */
  const sendConversational = useCallback((on: boolean) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'conversational', on }))
  }, [])

  /** Ask the server to finalise whatever speech it has buffered (so nothing leaks into the next turn). */
  const commitNow = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'commit' }))
  }, [])

  const setNoiseFilter = useCallback((next: NoiseFilter) => {
    setNoiseFilterState(next)
    try {
      localStorage.setItem(FILTER_KEY, next)
    } catch {
      // Not remembering the choice is fine.
    }
    processorRef.current?.port.postMessage({ gate: next !== 'off', ratio: FILTER_RATIO[next] || 0.35 })
  }, [])

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
              setProfile((p) => ({ ...(p ?? {}), id: msg.customerProfileId as string, captureMode: mode === 'debrief' ? 'DEBRIEF' : mode === 'juno-debrief' ? 'JUNO_DEBRIEF' : 'LIVE' }))
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
    mutedRef.current = false
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

  /** `flush: false` ends the session without transcribing the audio still buffered (nothing real is left in it). */
  const stop = useCallback((flush = true) => {
    setStatus('stopping')
    cleanupAudio()
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop', flush }))
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
    noiseFilter, setNoiseFilter, backgroundIgnored,
    start, stop, pause, resume, reset, setMicMuted, setLearning, setRawAmpListener, releaseHeld, sendLanguage, sendAgentSay, sendConversational, commitNow, saveTranscriptEdit, saveLifeMapEdit, patchProfile,
  }
}

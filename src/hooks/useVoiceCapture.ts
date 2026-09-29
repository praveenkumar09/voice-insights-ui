import { useCallback, useRef, useState } from 'react'
import { wsVoiceUrl } from '../api/client'
import type { CustomerProfile } from '../types'

export type VoiceCaptureStatus = 'idle' | 'connecting' | 'listening' | 'stopping' | 'stopped' | 'error'

interface VoiceMessage {
  type: string
  [key: string]: unknown
}

// OpenAI's realtime transcription sessions only accept 24kHz PCM input (GA
// schema requirement — see OpenAiRealtimeTranscriptionClient on the backend).
const TARGET_SAMPLE_RATE = 24000

export function useVoiceCapture() {
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle')
  const [amplitude, setAmplitude] = useState(0)
  const [partialText, setPartialText] = useState('')
  const [finalSegments, setFinalSegments] = useState<string[]>([])
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const cleanupAudio = useCallback(() => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioContextRef.current?.close().catch(() => {})
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    setAmplitude(0)
  }, [])

  const start = useCallback(async () => {
    setErrorMessage(null)
    setPartialText('')
    setFinalSegments([])
    setProfile(null)
    setStatus('connecting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioContextCtor()
      audioContextRef.current = audioContext

      const ws = new WebSocket(wsVoiceUrl())
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as VoiceMessage
        switch (msg.type) {
          case 'session_started':
            setProfile((p) => ({ ...(p ?? {}), id: msg.customerProfileId as string }))
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

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        setTimeout(() => reject(new Error('Connection to voice service timed out')), 8000)
      })

      // Resample to 16kHz PCM16 via a ScriptProcessorNode — the simplest
      // reliable path for a demo-scale mic pipeline. An AudioWorklet avoids
      // running on the main thread, but needs its own separately-served
      // module file; not worth the build complexity for this scope.
      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)

        let sumSquares = 0
        for (let i = 0; i < input.length; i++) sumSquares += input[i] * input[i]
        setAmplitude(Math.min(1, Math.sqrt(sumSquares / input.length) * 4))

        const resampled = downsampleTo16k(input, audioContext.sampleRate, TARGET_SAMPLE_RATE)
        const pcm16 = floatTo16BitPCM(resampled)
        if (ws.readyState === WebSocket.OPEN) ws.send(pcm16)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setStatus('listening')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start voice capture')
      setStatus('error')
      cleanupAudio()
    }
  }, [cleanupAudio])

  const stop = useCallback(() => {
    setStatus('stopping')
    cleanupAudio()
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
  }, [cleanupAudio])

  return { status, amplitude, partialText, finalSegments, profile, errorMessage, start, stop }
}

function downsampleTo16k(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (targetRate === inputRate) return input
  const ratio = inputRate / targetRate
  const newLength = Math.round(input.length / ratio)
  const result = new Float32Array(newLength)
  let offsetResult = 0
  let offsetInput = 0
  while (offsetResult < newLength) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio)
    let accum = 0
    let count = 0
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      accum += input[i]
      count++
    }
    result[offsetResult] = count > 0 ? accum / count : 0
    offsetResult++
    offsetInput = nextOffsetInput
  }
  return result
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)
  let offset = 0
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

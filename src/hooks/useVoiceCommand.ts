import { useCallback, useEffect, useRef, useState } from 'react'
import { junoSpeak } from '../api/client'
import { useVoiceCapture } from './useVoiceCapture'

/**
 * One spoken line, on request: tap, say it, and the words come back. Nothing is stored. It opens the same listen-only connection as the
 * Ask screen, stops by itself when the server hears the speaker finish (or when asked to), and closes again.
 */
export type VoicePhase = 'idle' | 'starting' | 'listening' | 'thinking'

const LISTEN_LIMIT_MS = 15000
const FINAL_WAIT_MS = 4500
const FINAL_SETTLE_MS = 900

export function useVoiceCommand() {
  const capture = useVoiceCapture()
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const phaseRef = useRef<VoicePhase>('idle')
  const resolver = useRef<((text: string | null) => void) | null>(null)
  const finalsRef = useRef<string[]>([])
  finalsRef.current = capture.finalSegments
  const limit = useRef<number | null>(null)
  const setBoth = (p: VoicePhase) => { phaseRef.current = p; setPhase(p) }
  const finish = (text: string | null) => {
    if (limit.current) window.clearTimeout(limit.current)
    limit.current = null
    const r = resolver.current
    resolver.current = null
    r?.(text)
  }

  /** Stop listening and hand back what was said. */
  const stop = useCallback(async () => {
    if (phaseRef.current !== 'listening') return
    setBoth('thinking')
    capture.commitNow()
    const start = performance.now()
    let seen = finalsRef.current.length
    let stableSince = performance.now()
    while (performance.now() - start < FINAL_WAIT_MS) {
      const n = finalsRef.current.length
      if (n !== seen) { seen = n; stableSince = performance.now() }
      if (n > 0 && performance.now() - stableSince > FINAL_SETTLE_MS) break
      await new Promise((r) => window.setTimeout(r, 100))
    }
    const text = finalsRef.current.join(' ').trim()
    capture.reset()
    setBoth('idle')
    finish(text || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    capture.setUtteranceEndListener(() => void stopRef.current())
    return () => capture.setUtteranceEndListener(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The listen-only connection opened (or could not).
  useEffect(() => {
    if (capture.status === 'listening' && phaseRef.current === 'starting') {
      setBoth('listening')
      limit.current = window.setTimeout(() => void stopRef.current(), LISTEN_LIMIT_MS)
    } else if (capture.status === 'error' && phaseRef.current !== 'idle') {
      setBoth('idle')
      finish(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.status])

  /** Opens the microphone and resolves with the words, or null if nothing was heard or the microphone was unavailable. */
  const listen = useCallback(() => new Promise<string | null>((resolve) => {
    if (phaseRef.current !== 'idle') return resolve(null)
    resolver.current = resolve
    setBoth('starting')
    void capture.start('ask')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const cancel = useCallback(() => {
    capture.reset()
    setBoth('idle')
    finish(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leaving the page closes the microphone.
  useEffect(() => () => { capture.reset() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { phase, listen, stop, cancel, caption: capture.partialText, amplitude: capture.amplitude }
}

/** Juno says one short line aloud (unless the advisor has switched Juno's voice off). Best effort: a failure is silent. */
export async function speakShort(text: string): Promise<void> {
  try {
    if (localStorage.getItem('vi_ask_voice_on') === '0') return
    const blob = await junoSpeak(text, 'female', 'warm', 'en')
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = new Audio(url)
    a.onended = () => URL.revokeObjectURL(url)
    await a.play()
  } catch {
    // The words are on screen anyway.
  }
}

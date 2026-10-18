import { junoSpeak } from '../api/client'

/** Text into sentences a voice can say one at a time: long ones are cut at a comma or semicolon, tiny ones joined to their neighbour. */
export function splitSentences(text: string): string[] {
  const raw = text.replace(/\s+/g, ' ').trim().match(/[^.!?。！？]+(?:[.!?。！？]+["')\]]*|$)/g) ?? [text]
  const out: string[] = []
  for (const piece of raw.map((s) => s.trim()).filter(Boolean)) {
    if (piece.length <= 260) {
      out.push(piece)
      continue
    }
    let rest = piece
    while (rest.length > 260) {
      const cut = Math.max(rest.lastIndexOf(', ', 240), rest.lastIndexOf('; ', 240))
      const at = cut > 80 ? cut + 1 : rest.lastIndexOf(' ', 240)
      out.push(rest.slice(0, at > 0 ? at : 240).trim())
      rest = rest.slice(at > 0 ? at : 240).trim()
    }
    if (rest) out.push(rest)
  }
  const merged: string[] = []
  for (const s of out) {
    if (merged.length && s.length < 24) merged[merged.length - 1] += ' ' + s
    else merged.push(s)
  }
  return merged
}

export interface Player {
  pause: () => void
  resume: () => void
  stop: () => void
  /** 'finished' when the last sentence was said, 'stopped' when it was cut short. */
  done: Promise<'finished' | 'stopped'>
}

/**
 * Says a list of sentences one after another, smoothly: the voice for the next few sentences is requested while the current one is
 * still playing, so there is no gap between them. Can be paused and resumed mid-sentence, and stopped. A sentence whose voice could not
 * be made is read by the browser's own voice rather than skipped.
 */
export function createPlayer(sentences: string[], voice: 'female' | 'male' = 'female'): Player {
  let stopped = false
  let paused = false
  let audio: HTMLAudioElement | null = null
  let wake: (() => void) | null = null
  let finishClip: (() => void) | null = null
  const clips: Promise<Blob | null>[] = []
  const clip = (i: number) => (i < sentences.length ? (clips[i] ??= junoSpeak(sentences[i], voice, 'warm', 'en')) : null)

  const play = (blob: Blob | null, text: string) => new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      finishClip = null
      audio = null
      resolve()
    }
    finishClip = finish
    if (!blob) {
      if (!window.speechSynthesis) return finish()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-GB'
      u.onend = finish
      u.onerror = finish
      window.speechSynthesis.speak(u)
      return
    }
    const url = URL.createObjectURL(blob)
    const a = new Audio(url)
    a.playbackRate = 1.04
    audio = a
    a.onended = () => { URL.revokeObjectURL(url); finish() }
    a.onerror = finish
    a.play().catch(finish)
  })

  const done = (async (): Promise<'finished' | 'stopped'> => {
    for (let i = 0; i < sentences.length; i++) {
      if (stopped) return 'stopped'
      clip(i); clip(i + 1); clip(i + 2) // look ahead
      const blob = await clip(i)!
      while (paused && !stopped) await new Promise<void>((r) => { wake = r })
      if (stopped) return 'stopped'
      await play(blob, sentences[i])
    }
    return stopped ? 'stopped' : 'finished'
  })()

  return {
    done,
    pause() {
      paused = true
      audio?.pause()
      try { window.speechSynthesis?.pause() } catch { /* nothing speaking */ }
    },
    resume() {
      paused = false
      void audio?.play()
      try { window.speechSynthesis?.resume() } catch { /* nothing speaking */ }
      wake?.()
    },
    stop() {
      stopped = true
      paused = false
      audio?.pause()
      try { window.speechSynthesis?.cancel() } catch { /* nothing speaking */ }
      finishClip?.()
      wake?.()
    },
  }
}

/** True when the sound is going to headphones, earbuds or a car/Bluetooth system rather than a loudspeaker the microphone could hear. */
export async function headphonesConnected(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const out = devices.filter((d) => d.kind === 'audiooutput')
    return out.some((d) => /headphone|headset|airpods|earbuds|buds|bluetooth|carplay|car audio/i.test(d.label))
  } catch {
    return false
  }
}

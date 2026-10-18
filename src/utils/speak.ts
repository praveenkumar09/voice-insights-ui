import { junoSpeak } from '../api/client'

/**
 * Juno speaks one line and the promise resolves when it has finished, so the caller can keep the microphone muted while it talks and
 * listen only afterwards. If Juno's voice is switched off (the Ask screen's setting), or speech is unavailable, the line is simply left
 * on screen for a moment and the promise resolves after a pause proportional to its length.
 */
let current: { audio: HTMLAudioElement; finish: () => void } | null = null

export function stopSpeaking() {
  current?.finish()
  try {
    window.speechSynthesis?.cancel()
  } catch {
    // Nothing was speaking.
  }
}

const voiceOn = () => {
  try {
    return localStorage.getItem('vi_ask_voice_on') !== '0'
  } catch {
    return true
  }
}

export function speakAndWait(text: string): Promise<void> {
  const readMs = Math.max(1200, Math.min(6000, text.length * 55))
  if (!voiceOn()) return new Promise((r) => window.setTimeout(r, readMs))
  return new Promise<void>((resolve) => {
    let done = false
    let timer: number | null = null
    const finish = () => {
      if (done) return
      done = true
      if (timer) window.clearTimeout(timer)
      current = null
      resolve()
    }
    timer = window.setTimeout(finish, Math.max(6000, text.length * 120 + 4000)) // a stuck clip never hangs the assistant
    void junoSpeak(text, 'female', 'warm', 'en').then((blob) => {
      if (done) return
      if (!blob) return browserVoice(text, finish)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.playbackRate = 1.04
      current = { audio, finish: () => { audio.pause(); URL.revokeObjectURL(url); finish() } }
      audio.onended = () => { URL.revokeObjectURL(url); finish() }
      audio.onerror = finish
      audio.play().catch(finish)
    })
  })
}

function browserVoice(text: string, finish: () => void) {
  if (!window.speechSynthesis) return window.setTimeout(finish, 1200)
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.onend = finish
  u.onerror = finish
  window.speechSynthesis.speak(u)
}

/** A short, soft two-note cue: Juno heard its name and is listening. No speech, so there is no delay. */
export function chime(kind: 'wake' | 'done' = 'wake') {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const notes = kind === 'wake' ? [660, 880] : [880, 660]
    notes.forEach((hz, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = hz
      const t = ctx.currentTime + i * 0.11
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.18)
    })
    window.setTimeout(() => ctx.close().catch(() => {}), 600)
  } catch {
    // A cue is a nicety.
  }
}

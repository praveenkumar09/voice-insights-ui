import { useCallback, useEffect, useRef, useState } from 'react'
import { askJuno, clearAskHistory, getAskHistory, getAskStarters, junoSpeak, junoVoiceStatus, type AskEvent, type AskSource, type AskStarter, type LangId } from '../api/client'
import { useVoiceCapture } from './useVoiceCapture'

/**
 * Talking a suggestion through with Juno, out loud.
 *
 * The conversation is a loop: Juno listens, notices when the advisor has finished their question (the voice goes quiet),
 * sends it, and speaks the answer one sentence at a time as it is being written, so the first words come back while the rest
 * is still being thought. Pressing the orb while Juno talks interrupts it at once. A short "Mm, let me think" covers the pause
 * when the answer is slow to start. While Juno speaks the microphone is muted so it never hears itself.
 */
export type AskPhase = 'off' | 'starting' | 'ready' | 'listening' | 'hearing' | 'thinking' | 'speaking'

export interface AskSentence {
  key: string
  text: string
  sources: AskSource[]
  /** A spoken sentence appears on screen when its audio starts, so the words and the voice stay together. */
  shown: boolean
}

export interface AskMessage {
  id: string
  role: 'advisor' | 'juno'
  text?: string
  sentences: AskSentence[]
  done: boolean
  interrupted?: boolean
  error?: string
}

export type VoiceKind = 'female' | 'male'

// The server tells us when a question is finished (it judges the pause against the speaker). This long a silence by our own,
// cruder measure is only a fallback if that message never comes.
const FALLBACK_SILENCE_MS = 4500
const MIN_SPEECH_MS = 450          // a shorter sound is a cough or a click, not a question
const FINAL_WAIT_MS = 4500         // how long to wait for the words of a question to come back from the speech model
const FINAL_SETTLE_MS = 900        // ...and for a further part of it, if the advisor paused mid-question
const UNMUTE_DELAY_MS = 350        // after Juno's last word, so its own echo is not heard as a question
const FILLER_AFTER_MS = 300        // an answer slower to start than this gets a spoken "Mm, let me think" (the model alone takes ~2 s to begin)
const FILLERS = ['Mm, let me think.', 'Good one, give me a second.', 'Right, let me check that.']
// If the answer is still not ready when that first one ends, a second, longer one carries the wait.
const FILLERS_2 = ['Just pulling his file up.', 'Bear with me, putting that together.', 'One moment, checking the documents.']

const KEY_VOICE_ON = 'vi_ask_voice_on'
const KEY_VOICE = 'vi_ask_voice'
const KEY_HANDS_FREE = 'vi_ask_hands_free'

function load<T>(key: string, fallback: T, parse: (v: string) => T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : parse(v)
  } catch {
    return fallback
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembering a setting is fine.
  }
}

const langOf = (t: string): LangId => (/[一-鿿]/.test(t) ? 'zh' : /[஀-௿]/.test(t) ? 'ta' : 'en')

interface QueueItem {
  sentence?: { messageId: string; key: string; text: string }
  clip: Promise<Blob | null> | null
  filler?: boolean
}

export function useAskJuno(runId: string) {
  const capture = useVoiceCapture()
  const [phase, setPhaseState] = useState<AskPhase>('off')
  const phaseRef = useRef<AskPhase>('off')
  const setPhase = useCallback((p: AskPhase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])

  const [messages, setMessages] = useState<AskMessage[]>([])
  const [earlier, setEarlier] = useState<AskMessage[]>([])
  const [starters, setStarters] = useState<AskStarter[]>([])
  const [hint, setHint] = useState<string | null>(null)
  const [voiceOn, setVoiceOnState] = useState(() => load(KEY_VOICE_ON, true, (v) => v !== '0'))
  const [voiceKind, setVoiceKindState] = useState<VoiceKind>(() => load<VoiceKind>(KEY_VOICE, 'female', (v) => (v === 'male' ? 'male' : 'female')))
  const [handsFree, setHandsFreeState] = useState(() => load(KEY_HANDS_FREE, true, (v) => v !== '0'))
  const [neuralVoice, setNeuralVoice] = useState(true)

  const voiceOnRef = useRef(voiceOn)
  const voiceKindRef = useRef(voiceKind)
  const handsFreeRef = useRef(handsFree)
  voiceOnRef.current = voiceOn
  voiceKindRef.current = voiceKind
  handsFreeRef.current = handsFree

  // What the speech model has returned so far, and how much of it is already part of a question.
  const finalsRef = useRef<string[]>([])
  finalsRef.current = capture.finalSegments
  const consumedRef = useRef(0)
  const serverEndAtRef = useRef(0)   // when the server last said every transcript of the question was back

  // The conversation currently in flight. Bumping `gen` makes every callback of the previous one stand down.
  const gen = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const queue = useRef<QueueItem[]>([])
  const playing = useRef(false)
  const streamDone = useRef(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const clipTimer = useRef<number | null>(null)
  const fillerTimer = useRef<number | null>(null)
  const gotSentence = useRef(false)
  const lastFiller = useRef(-1)
  const fillerClips = useRef<(Promise<Blob | null>)[]>([])
  const fillerClips2 = useRef<(Promise<Blob | null>)[]>([])
  const fillerStage = useRef(0)
  const msgSeq = useRef(0)
  // Where the time goes between a question and Juno's first words (read from the console: window.__askTiming).
  const timing = useRef<Record<string, number>>({})
  const stamp = (k: string) => {
    const w = window as unknown as { __askStamps?: Record<string, number> }
    w.__askStamps = { ...(w.__askStamps ?? {}), [k]: Math.round(performance.timeOrigin + performance.now()) }
  }
  const mark = (k: string) => {
    if (timing.current[k] === undefined) {
      timing.current[k] = Math.round(performance.now() - (timing.current.ask ?? performance.now()))
      ;(window as unknown as { __askTiming?: unknown }).__askTiming = { ...timing.current }
    }
  }

  // ── voice settings ──
  const setVoiceOn = useCallback((on: boolean) => {
    setVoiceOnState(on)
    save(KEY_VOICE_ON, on ? '1' : '0')
    if (!on) stopAudio()
  }, [])
  const setVoiceKind = useCallback((k: VoiceKind) => {
    setVoiceKindState(k)
    save(KEY_VOICE, k)
    fillerClips.current = [] // the thinking sounds are in the old voice
    fillerClips2.current = []
  }, [])
  const setHandsFree = useCallback((on: boolean) => {
    setHandsFreeState(on)
    save(KEY_HANDS_FREE, on ? '1' : '0')
  }, [])

  // ── loading what is already there ──
  useEffect(() => {
    let live = true
    void getAskStarters(runId).then((s) => live && setStarters(s))
    void getAskHistory(runId).then((turns) => {
      if (!live) return
      setEarlier(
        turns.flatMap((t) => [
          { id: `h${t.turn}q`, role: 'advisor' as const, text: t.question, sentences: [], done: true },
          {
            id: `h${t.turn}a`,
            role: 'juno' as const,
            sentences: [{ key: `h${t.turn}`, text: t.answer, sources: Object.values(t.sources ?? {}), shown: true }],
            done: true,
          },
        ]),
      )
    })
    void junoVoiceStatus().then((v) => live && setNeuralVoice(v.enabled))
    return () => {
      live = false
    }
  }, [runId])

  // ── audio ──
  function stopAudio() {
    stopCurrent()
    queue.current = []
    playing.current = false
  }

  const clearFillerTimer = () => {
    if (fillerTimer.current) window.clearTimeout(fillerTimer.current)
    fillerTimer.current = null
  }

  const revealSentence = (messageId: string, key: string) =>
    setMessages((ms) => ms.map((m) => (m.id === messageId ? { ...m, sentences: m.sentences.map((s) => (s.key === key ? { ...s, shown: true } : s)) } : m)))

  /** Back to waiting: listening again if hands-free, otherwise ready for the next tap. */
  const settle = (g: number) => {
    if (g !== gen.current) return
    window.setTimeout(() => {
      if (g !== gen.current) return
      capture.setMicMuted(false)
      consumedRef.current = finalsRef.current.length
      vad.current = { floor: vad.current.floor, loud: 0, lastLoud: 0, started: 0, speaking: false }
      // With the microphone open the conversation carries on (or waits for a tap); a typed question leaves it closed.
      if (!sessionOpen.current) setPhase('off')
      else setPhase(handsFreeRef.current ? 'listening' : 'ready')
    }, UNMUTE_DELAY_MS)
  }

  const finishIfDone = (g: number) => {
    if (g !== gen.current) return
    if (streamDone.current && !playing.current && queue.current.length === 0) settle(g)
  }

  function playNext(g: number) {
    if (g !== gen.current) return
    const item = queue.current.shift()
    if (!item) {
      playing.current = false
      finishIfDone(g)
      return
    }
    playing.current = true
    setPhase('speaking')
    capture.setMicMuted(true)
    void (item.clip ?? Promise.resolve(null)).then((blob) => {
      if (g !== gen.current) return
      if (item.sentence) revealSentence(item.sentence.messageId, item.sentence.key)
      mark(item.filler ? 'fillerStarts' : 'firstAnswerAudio')
      // Exactly one thing is ever speaking: whatever was playing is stopped first, and each sentence can move the conversation
      // on only once (its own end, its own safety timer, or an error — whichever comes first, never two of them).
      stopCurrent()
      let moved = false
      let timer: number | null = null
      const move = () => {
        if (moved) return
        moved = true
        if (timer) window.clearTimeout(timer)
        if (clipTimer.current === timer) clipTimer.current = null
        playNext(g)
      }
      const text = item.sentence?.text ?? ''
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = new Audio(url)
        a.playbackRate = 1.04
        audioRef.current = a
        a.onended = () => {
          URL.revokeObjectURL(url)
          if (item.filler) moreFiller(g)
          move()
        }
        a.onerror = move
        timer = window.setTimeout(move, Math.max(5000, text.length * 110 + 4000)) // never let a stuck clip hang the conversation
        clipTimer.current = timer
        a.play().catch(move)
      } else if (item.filler || !text || !window.speechSynthesis) {
        timer = window.setTimeout(move, item.filler ? 0 : 250)
      } else {
        // The neural voice failed for this line: the browser's own voice keeps the conversation going.
        const u = new SpeechSynthesisUtterance(text)
        u.lang = langOf(text) === 'zh' ? 'zh-CN' : langOf(text) === 'ta' ? 'ta-IN' : 'en-GB'
        u.onend = move
        u.onerror = move
        timer = window.setTimeout(move, Math.max(4000, text.length * 90 + 3000))
        clipTimer.current = timer
        window.speechSynthesis.speak(u)
      }
    })
  }

  /** Stops whatever is speaking right now (the neural clip and the browser voice) without touching the queue. */
  function stopCurrent() {
    if (clipTimer.current) window.clearTimeout(clipTimer.current)
    clipTimer.current = null
    const a = audioRef.current
    if (a) {
      a.onended = null
      a.onerror = null
      a.pause()
      audioRef.current = null
    }
    try {
      window.speechSynthesis?.cancel()
    } catch {
      // No browser voice: nothing to stop.
    }
  }

  const prefetchFillers = () => {
    if (!voiceOnRef.current || fillerClips.current.length) return
    fillerClips.current = FILLERS.map((f) => junoSpeak(f, voiceKindRef.current, 'curious', 'en'))
    fillerClips2.current = FILLERS_2.map((f) => junoSpeak(f, voiceKindRef.current, 'warm', 'en'))
  }

  /** The first thinking sound ended and there is still no answer: a second, longer one (once). */
  const moreFiller = (g: number) => {
    if (g !== gen.current || gotSentence.current || fillerStage.current >= 2 || !fillerClips2.current.length) return
    fillerStage.current = 2
    const i = Math.floor(Math.random() * fillerClips2.current.length)
    queue.current.unshift({ clip: fillerClips2.current[i], filler: true })
  }

  const playFiller = (g: number) => {
    if (g !== gen.current || gotSentence.current || !voiceOnRef.current || !fillerClips.current.length) return
    let i = Math.floor(Math.random() * fillerClips.current.length)
    if (i === lastFiller.current) i = (i + 1) % fillerClips.current.length
    lastFiller.current = i
    fillerStage.current = 1
    queue.current.unshift({ clip: fillerClips.current[i], filler: true })
    if (!playing.current) playNext(g)
  }

  // ── asking ──
  const sessionOpen = useRef(false)

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q) return
      stopAudio()
      abortRef.current?.abort()
      clearFillerTimer()
      const g = ++gen.current
      const ctrl = new AbortController()
      abortRef.current = ctrl
      streamDone.current = false
      gotSentence.current = false
      fillerStage.current = 0
      timing.current = { ask: performance.now(), askAt: Math.round(performance.timeOrigin + performance.now()) }
      setHint(null)
      prefetchFillers()

      const base = ++msgSeq.current
      const juno = `j${base}`
      setMessages((ms) => [
        ...ms,
        { id: `a${base}`, role: 'advisor', text: q, sentences: [], done: true },
        { id: juno, role: 'juno', sentences: [], done: false },
      ])
      capture.setMicMuted(true)
      setPhase('thinking')
      fillerTimer.current = window.setTimeout(() => playFiller(g), FILLER_AFTER_MS)

      let seq = 0
      const onEvent = (ev: AskEvent) => {
        if (g !== gen.current) return
        if (ev.type === 'sentence') {
          mark('firstSentence')
          gotSentence.current = true
          clearFillerTimer()
          const key = `${juno}s${++seq}`
          const spoken = voiceOnRef.current
          setMessages((ms) => ms.map((m) => (m.id === juno ? { ...m, sentences: [...m.sentences, { key, text: ev.text, sources: ev.sources, shown: !spoken }] } : m)))
          if (spoken) {
            queue.current.push({ sentence: { messageId: juno, key, text: ev.text }, clip: junoSpeak(ev.text, voiceKindRef.current, 'warm', langOf(ev.text)) })
            if (!playing.current) playNext(g)
          } else if (phaseRef.current === 'thinking') {
            setPhase('speaking')
          }
        } else if (ev.type === 'error') {
          clearFillerTimer()
          setMessages((ms) => ms.map((m) => (m.id === juno ? { ...m, error: ev.message, done: true } : m)))
        } else if (ev.type === 'done') {
          clearFillerTimer()
          setMessages((ms) => ms.map((m) => (m.id === juno ? { ...m, done: true } : m)))
        }
      }
      try {
        await askJuno(runId, q, onEvent, ctrl.signal)
      } catch (e) {
        if ((e as { name?: string }).name !== 'AbortError' && g === gen.current) {
          onEvent({ type: 'error', message: "I couldn't reach my notes just now — please ask again." })
        }
      }
      if (g !== gen.current) return
      streamDone.current = true
      setMessages((ms) => ms.map((m) => (m.id === juno ? { ...m, done: true } : m)))
      if (!playing.current && queue.current.length === 0) settle(g)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runId],
  )

  // ── listening: noticing when a question starts and ends ──
  const vad = useRef({ floor: 0.02, loud: 0, lastLoud: 0, started: 0, speaking: false })

  const endOfUtterance = async (serverDetected = false) => {
    stamp('endSignalAt')
    const sentAt = performance.now()
    const g = gen.current
    vad.current.speaking = false
    setPhase('thinking')
    if (!serverDetected) capture.commitNow() // the server already sent what it was holding when it spotted the end itself
    // The words of the question come back from the speech model a moment later; wait for them, and for a second part if there is one.
    const start = performance.now()
    let stableSince = performance.now()
    let seen = finalsRef.current.length
    // The server sends its end signal only after every transcript of the question has come back, so a short beat is enough.
    // After a manual "I'm done" (or the fallback) the words are still on the way: wait for them, and for a further part.
    if (serverDetected) await new Promise((r) => window.setTimeout(r, 100))
    while (performance.now() - start < FINAL_WAIT_MS) {
      if (g !== gen.current) return
      const n = finalsRef.current.length
      if (n !== seen) {
        seen = n
        stableSince = performance.now()
      }
      if (n > consumedRef.current && (serverDetected || serverEndAtRef.current > sentAt || performance.now() - stableSince > FINAL_SETTLE_MS)) break
      await new Promise((r) => window.setTimeout(r, 100))
    }
    stamp('finalsAt')
    const text = finalsRef.current.slice(consumedRef.current).join(' ').trim()
    consumedRef.current = finalsRef.current.length
    if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 3) {
      setHint("I didn't quite catch that — say it again?")
      setPhase(handsFreeRef.current ? 'listening' : 'ready')
      return
    }
    void ask(text)
  }

  const onAmp = (amp: number) => {
    const phaseNow = phaseRef.current
    if (phaseNow !== 'listening' && phaseNow !== 'hearing') return
    const v = vad.current
    const now = performance.now()
    // The room's own level follows quiet moments quickly and rises very slowly.
    v.floor = amp < v.floor * 1.6 ? v.floor * 0.94 + amp * 0.06 : v.floor * 0.998 + amp * 0.002
    const loud = amp > Math.max(0.05, v.floor * 2.4)
    if (loud) {
      v.loud++
      v.lastLoud = now
      if (v.loud >= 2 && !v.speaking) {
        v.speaking = true
        v.started = now
        setHint(null)
        setPhase('hearing')
      }
    } else {
      v.loud = 0
    }
    if (v.speaking && now - v.lastLoud > FALLBACK_SILENCE_MS) {
      if (v.lastLoud - v.started < MIN_SPEECH_MS) {
        v.speaking = false
        setPhase('listening')
      } else {
        void endOfUtterance()
      }
    }
  }
  const ampRef = useRef(onAmp)
  ampRef.current = onAmp
  const endRef = useRef(endOfUtterance)
  endRef.current = endOfUtterance
  useEffect(() => {
    capture.setRawAmpListener((a) => ampRef.current(a))
    capture.setUtteranceEndListener(() => {
      serverEndAtRef.current = performance.now()
      const p = phaseRef.current
      if (p === 'listening' || p === 'hearing') void endRef.current(true)
    })
    return () => {
      capture.setRawAmpListener(null)
      capture.setUtteranceEndListener(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The session opens (or fails) a moment after begin().
  useEffect(() => {
    if (capture.status === 'listening' && phaseRef.current === 'starting') {
      sessionOpen.current = true
      consumedRef.current = 0
      vad.current = { floor: 0.02, loud: 0, lastLoud: 0, started: 0, speaking: false }
      prefetchFillers()
      setPhase('listening')
    } else if (capture.status === 'error' && (phaseRef.current === 'starting' || sessionOpen.current)) {
      sessionOpen.current = false
      setHint(capture.errorMessage ?? "I can't hear the microphone — check that it is allowed, or type your question.")
      setPhase('off')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.status])

  // ── what the advisor does ──
  const begin = useCallback(async () => {
    if (phaseRef.current !== 'off') return
    setHint(null)
    setPhase('starting')
    prefetchFillers()
    await capture.start('ask')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const interrupt = useCallback(() => {
    ++gen.current
    abortRef.current?.abort()
    clearFillerTimer()
    stopAudio()
    streamDone.current = true
    // What was not yet spoken is dropped from the screen, and the answer is marked as cut in on (even if it had finished writing).
    setMessages((ms) => {
      const lastJuno = [...ms].reverse().find((m) => m.role === 'juno')
      return ms.map((m) => {
        if (m !== lastJuno) return m
        const cut = !m.done || m.sentences.some((s) => !s.shown)
        return cut ? { ...m, done: true, interrupted: true, sentences: m.sentences.filter((s) => s.shown) } : m
      })
    })
    capture.setMicMuted(false)
    consumedRef.current = finalsRef.current.length
    vad.current = { floor: vad.current.floor, loud: 0, lastLoud: 0, started: 0, speaking: false }
    if (sessionOpen.current) setPhase(handsFreeRef.current ? 'listening' : 'ready')
    else setPhase('off')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** The orb: start, stop talking, or interrupt — whatever makes sense for what Juno is doing now. */
  const tapOrb = useCallback(() => {
    const p = phaseRef.current
    if (p === 'off') void begin()
    else if (p === 'ready') {
      capture.setMicMuted(false)
      setHint(null)
      setPhase('listening')
    } else if (p === 'hearing') void endOfUtterance()
    else if (p === 'listening') setPhase('ready')
    else if (p === 'thinking' || p === 'speaking') interrupt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const end = useCallback(() => {
    gen.current++
    abortRef.current?.abort()
    clearFillerTimer()
    stopAudio()
    capture.reset()
    sessionOpen.current = false
    setMessages((ms) => ms.map((m) => (m.role === 'juno' && !m.done ? { ...m, done: true, interrupted: true, sentences: m.sentences.map((s) => ({ ...s, shown: true })) } : m)))
    setPhase('off')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const newDiscussion = useCallback(() => {
    interrupt()
    setMessages([])
    setEarlier([])
    void clearAskHistory(runId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // Leaving the page ends the conversation and releases the microphone.
  useEffect(
    () => () => {
      gen.current++
      abortRef.current?.abort()
      if (fillerTimer.current) window.clearTimeout(fillerTimer.current)
      stopAudio()
      capture.reset()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // What the advisor is saying right now, as the speech model hears it.
  const caption = [...capture.finalSegments.slice(consumedRef.current), capture.partialText].filter(Boolean).join(' ').trim()

  return {
    phase, messages, earlier, starters, hint, caption, amplitude: capture.amplitude,
    voiceOn, voiceKind, handsFree, neuralVoice,
    setVoiceOn, setVoiceKind, setHandsFree,
    tapOrb, ask, interrupt, end, newDiscussion,
  }
}

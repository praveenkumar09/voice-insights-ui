import { useCallback, useEffect, useRef, useState } from 'react'
import { junoSpeak, rehearsalBrief, rehearsalScore, rehearsalTurn, type RehearsalBrief, type RehearsalCoachFlag, type RehearsalScorecard } from '../api/client'
import { useVoiceCapture } from './useVoiceCapture'

/**
 * Dress Rehearsal: Juno briefs the advisor on the next meeting, then plays the customer so the advisor can practise, then coaches.
 * The conversation is a loop like the Ask screen's: the advisor speaks (or types), the customer answers aloud, the microphone is
 * muted while anyone but the advisor speaks. Nothing is stored and nothing is sent to a customer.
 */
export type RehearsalStage = 'idle' | 'briefing' | 'brief' | 'rehearsing' | 'scoring' | 'done'
/** What is happening right now in a rehearsal. 'typing' means no microphone: the advisor types instead. */
export type Beat = 'starting' | 'listening' | 'hearing' | 'thinking' | 'speaking' | 'typing'
export type Speaker = 'juno' | 'customer' | null

export interface RehearsalMessage {
  id: number
  role: 'advisor' | 'customer'
  text: string
  /** Set on an advisor line the coach flagged as risky. */
  flag?: RehearsalCoachFlag
  /** A customer line is shown when its audio starts, so the words and the voice stay together. */
  shown: boolean
  /** The answer this customer line replies to (a spoken answer can still be withdrawn, and its reply goes with it). */
  turn?: number
}

const FALLBACK_SILENCE_MS = 4500   // our own measure of a finished answer, used only if the server's end signal never comes
const MIN_SPEECH_MS = 450          // a shorter sound is a cough or a click
const FINAL_WAIT_MS = 4500         // how long to wait for the words of an answer to come back from the speech model
const FINAL_SETTLE_MS = 900
const UNMUTE_DELAY_MS = 200        // after the last word, so an echo is not heard as the advisor
const MIN_ROUNDS_FOR_NOTES = 1
const DANGLING_PATIENCE_MS = 1400  // an answer that trails off ("...and the") is given this long to continue before it is sent
const TRAILING = /(\b(and|but|so|because|then|or|also|like|um|uh|er|erm|well|if|when|that|which|with|to|of|for|in|on|at|my|our|the|a|an|is|are|was|were|i|we)\b|[,;:\u2013-]|\.\.\.|\u2026)\s*$/i
const SENTENCE_END = /[.!?\u3002\uFF01\uFF1F]["')\u201d]?\s*$/

const TONES: Record<string, string> = { warm: 'warm', curious: 'curious', hesitant: 'gentle', worried: 'gentle', doubtful: 'curious', keen: 'upbeat' }

/** Timeline of what the rehearsal loop did (window.__rehearsalDbg), so slow or cut-off turns can be explained from the console. */
function dbg(event: string, detail?: unknown) {
  const w = window as unknown as { __rehearsalDbg?: { t: number; event: string; detail?: unknown }[] }
  ;(w.__rehearsalDbg ??= []).push({ t: Math.round(performance.now()), event, detail })
}

export function useRehearsal(profileId: string) {
  const capture = useVoiceCapture()
  const [stage, setStage] = useState<RehearsalStage>('idle')
  const [beat, setBeat] = useState<Beat>('starting')
  const [speaker, setSpeaker] = useState<Speaker>(null)
  const [brief, setBrief] = useState<RehearsalBrief | null>(null)
  const [messages, setMessages] = useState<RehearsalMessage[]>([])
  const [scorecard, setScorecard] = useState<RehearsalScorecard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [voiceOn, setVoiceOnState] = useState(true)

  const stageRef = useRef<RehearsalStage>('idle')
  const beatRef = useRef<Beat>('starting')
  const messagesRef = useRef<RehearsalMessage[]>([])
  const briefRef = useRef<RehearsalBrief | null>(null)
  const voiceOnRef = useRef(true)
  const micOpen = useRef(false)
  const gen = useRef(0)
  const seq = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const finalsRef = useRef<string[]>([])
  finalsRef.current = capture.finalSegments
  const consumed = useRef(0)
  const serverEndAt = useRef(0)
  const vad = useRef({ floor: 0.02, loud: 0, lastLoud: 0, started: 0, speaking: false })
  // An answer that has been sent but whose reply has not yet started to play: the microphone stays open for it, so that if the
  // advisor was only pausing and carries on, it is withdrawn and sent again with everything they said.
  const turnRef = useRef<{ id: number; prevConsumed: number; advisorId: number; finalsAtSubmit: number } | null>(null)
  const turnSeq = useRef(0)
  const timing = useRef<Record<string, number>>({})

  const setStageBoth = (s: RehearsalStage) => { stageRef.current = s; setStage(s) }
  const setBeatBoth = (b: Beat) => { beatRef.current = b; setBeat(b) }
  const setList = (next: RehearsalMessage[]) => { messagesRef.current = next; setMessages(next) }

  const setVoiceOn = useCallback((on: boolean) => {
    voiceOnRef.current = on
    setVoiceOnState(on)
    if (!on) stopAudio()
  }, [])

  // ── speaking ──
  function stopAudio() {
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
      // Nothing to cancel.
    }
  }

  /**
   * Plays a line aloud, one sentence at a time: the voice for every sentence is requested at once, so speech starts after the first
   * sentence is ready rather than after the whole line. Resolves when it has finished (or at once with the voice off). A stuck clip
   * times out, so the conversation never hangs. {@code onStart} fires as the first sound begins.
   */
  function speak(text: string, voice: 'female' | 'male', tone: string, g: number, onStart?: () => void, cancelled?: () => boolean): Promise<void> {
    const parts = text.split(/(?<=[.!?\u3002\uFF01\uFF1F])\s+/).map((x) => x.trim()).filter(Boolean)
    const clips = (parts.length ? parts : [text]).map((part) => ({ part, blob: voiceOnRef.current ? junoSpeak(part, voice, tone, 'en') : Promise.resolve(null) }))
    let started = false
    const start = () => {
      if (started) return
      started = true
      onStart?.()
    }
    const playOne = (c: { part: string; blob: Promise<Blob | null> }) => new Promise<void>((resolve) => {
      let done = false
      let timer: number | null = null
      const finish = () => {
        if (done) return
        done = true
        if (timer) window.clearTimeout(timer)
        resolve()
      }
      void c.blob.then((blob) => {
        if (g !== gen.current || !voiceOnRef.current || cancelled?.()) return finish()
        stopAudio()
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = new Audio(url)
          a.playbackRate = 1.04
          audioRef.current = a
          a.onended = () => { URL.revokeObjectURL(url); finish() }
          a.onerror = finish
          timer = window.setTimeout(finish, Math.max(5000, c.part.length * 110 + 4000))
          start()
          a.play().catch(finish)
        } else if (window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance(c.part)
          u.lang = 'en-GB'
          u.onend = finish
          u.onerror = finish
          timer = window.setTimeout(finish, Math.max(4000, c.part.length * 90 + 3000))
          start()
          window.speechSynthesis.speak(u)
        } else {
          finish()
        }
      })
    })
    return (async () => {
      for (const c of clips) {
        if (g !== gen.current || !voiceOnRef.current || cancelled?.()) break
        await playOne(c)
      }
      if (!cancelled?.()) start() // voice off or nothing to play: the words still appear
    })()
  }

  const junoVoice = (): 'female' | 'male' => (briefRef.current?.customerVoice === 'male' ? 'female' : 'male')

  // ── the briefing ──
  const startBrief = useCallback(async () => {
    const g = ++gen.current
    setError(null)
    setStageBoth('briefing')
    try {
      const b = await rehearsalBrief(profileId)
      if (g !== gen.current) return
      briefRef.current = b
      setBrief(b)
      setStageBoth('brief')
      setSpeaker('juno')
      await speak(b.script, junoVoice(), 'warm', g)
      if (g === gen.current) setSpeaker(null)
    } catch (e) {
      if (g !== gen.current) return
      setError(e instanceof Error ? e.message : 'Could not prepare the briefing')
      setStageBoth('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  // ── the rehearsal ──
  /** The customer's next line: asked for, shown as it starts to be spoken, then the advisor's turn again. */
  async function customerTurn(g: number, turnId: number) {
    setBeatBoth('thinking')
    try {
      const lines = messagesRef.current.map((m) => ({ role: m.role, text: m.text }))
      const t = await rehearsalTurn(profileId, lines)
      if (g !== gen.current) return
      // The advisor carried on speaking while this was being written: it is withdrawn and a fuller answer will be sent.
      if (turnId && turnRef.current?.id !== turnId) return
      timing.current.replyAt = performance.now()
      dbg('reply', { turnId, say: t.say.slice(0, 40), coach: !!t.coach })
      const id = ++seq.current
      let next = messagesRef.current
      if (t.coach) {
        // The flag belongs to the advisor's last line.
        const lastAdvisor = [...next].reverse().find((m) => m.role === 'advisor')
        if (lastAdvisor) next = next.map((m) => (m.id === lastAdvisor.id ? { ...m, flag: t.coach! } : m))
      }
      setList([...next, { id, role: 'customer', text: t.say, shown: false, turn: turnId || undefined }])
      let committed = false
      // The advisor carried on after this reply was written but before it was heard: it is dropped without a sound.
      const cancelled = () => !committed && !!turnId && turnRef.current?.id !== turnId
      const reveal = () => {
        if (g !== gen.current || cancelled()) return
        committed = true
        timing.current.audioAt = performance.now()
        dbg('audio-start', { turnId })
        turnRef.current = null // from here on the answer stands: what is heard next belongs to the next turn
        capture.turnTaken()
        capture.setMicMuted(true)
        setBeatBoth('speaking')
        setSpeaker('customer')
        setList(messagesRef.current.map((m) => (m.id === id ? { ...m, shown: true } : m)))
      }
      await speak(t.say, briefRef.current?.customerVoice ?? 'female', TONES[t.mood] ?? 'warm', g, reveal, cancelled)
      if (g !== gen.current || (!committed && cancelled())) return
      setSpeaker(null)
      window.setTimeout(() => {
        if (g !== gen.current) return
        capture.setMicMuted(false)
        consumed.current = finalsRef.current.length
        vad.current = { floor: vad.current.floor, loud: 0, lastLoud: 0, started: 0, speaking: false }
        setBeatBoth(micOpen.current ? 'listening' : 'typing')
      }, UNMUTE_DELAY_MS)
    } catch (e) {
      if (g !== gen.current) return
      if (turnId && turnRef.current?.id !== turnId) return
      turnRef.current = null
      setHint(e instanceof Error ? e.message : 'The customer did not answer. Try again.')
      setBeatBoth(micOpen.current ? 'listening' : 'typing')
    }
  }

  /** A typed answer is final at once; a spoken one (with prevConsumed) can still be withdrawn if the advisor carries on. */
  const submitAdvisor = useCallback((text: string, prevConsumed?: number) => {
    const t = text.trim()
    if (!t || stageRef.current !== 'rehearsing') return
    const b = beatRef.current
    if (b === 'starting' || (b === 'thinking' && prevConsumed === undefined)) return
    const g = gen.current
    if (b === 'speaking') stopAudio() // cutting in: the customer stops talking and the advisor's line is taken
    setHint(null)
    const advisorId = ++seq.current
    setList([...messagesRef.current, { id: advisorId, role: 'advisor', text: t, shown: true }])
    const turnId = prevConsumed === undefined ? 0 : ++turnSeq.current
    if (turnId && prevConsumed !== undefined) turnRef.current = { id: turnId, prevConsumed, advisorId, finalsAtSubmit: finalsRef.current.length }
    timing.current.sentAt = performance.now()
    dbg('submit', { turnId, text: t.slice(0, 60) })
    void customerTurn(g, turnId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  /** They were only pausing: take the answer back and wait for the rest of what they say. */
  const withdrawTurn = () => {
    const t = turnRef.current
    if (!t || beatRef.current === 'speaking') return
    dbg('withdraw', { turn: t.id })
    turnRef.current = null
    setList(messagesRef.current.filter((m) => m.id !== t.advisorId && m.turn !== t.id))
    consumed.current = t.prevConsumed
    const now = performance.now()
    vad.current = { floor: vad.current.floor, loud: 2, lastLoud: now, started: now, speaking: true }
    setBeatBoth('hearing')
  }
  const withdrawRef = useRef(withdrawTurn)
  withdrawRef.current = withdrawTurn

  const startRehearsal = useCallback(async () => {
    if (!briefRef.current) return
    stopAudio()
    const g = ++gen.current
    setSpeaker(null)
    setHint(null)
    setList([])
    setScorecard(null)
    setStageBoth('rehearsing')
    setBeatBoth('starting')
    consumed.current = 0
    micOpen.current = false
    void capture.start('ask') // the microphone opens a moment later; the customer opens the meeting meanwhile
    await customerTurn(g, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  // The microphone opened (or could not): without it the advisor types.
  useEffect(() => {
    if (stageRef.current !== 'rehearsing') return
    if (capture.status === 'listening') {
      micOpen.current = true
      vad.current = { floor: 0.02, loud: 0, lastLoud: 0, started: 0, speaking: false }
      if (beatRef.current === 'typing') setBeatBoth('listening')
    } else if (capture.status === 'error') {
      micOpen.current = false
      setHint('The microphone is not available here. You can type your side instead.')
      if (beatRef.current === 'listening' || beatRef.current === 'hearing') setBeatBoth('typing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.status])

  // ── hearing the advisor: noticing when they have finished speaking ──
  const endOfUtterance = async (serverDetected = false) => {
    const sentAt = performance.now()
    const g = gen.current
    timing.current.endAt = sentAt
    dbg('end-of-utterance', { serverDetected })
    vad.current.speaking = false
    setBeatBoth('thinking')
    if (!serverDetected) capture.commitNow()
    const start = performance.now()
    let stableSince = performance.now()
    let seen = finalsRef.current.length
    if (serverDetected) await new Promise((r) => window.setTimeout(r, 100))
    while (performance.now() - start < FINAL_WAIT_MS) {
      if (g !== gen.current) return
      const n = finalsRef.current.length
      if (n !== seen) { seen = n; stableSince = performance.now() }
      if (n > consumed.current && (serverDetected || serverEndAt.current > sentAt || performance.now() - stableSince > FINAL_SETTLE_MS)) break
      await new Promise((r) => window.setTimeout(r, 100))
    }
    let text = finalsRef.current.slice(consumed.current).join(' ').trim()
    dbg('finals-read', { text: text.slice(0, 80) })
    // An answer that ends mid-thought is given a moment to continue: if more words (or more voice) arrive, it is read again whole.
    while (text && (!SENTENCE_END.test(text) || TRAILING.test(text))) {
      const heldAt = performance.now()
      const count = finalsRef.current.length
      const loudBefore = vad.current.lastLoud
      while (performance.now() - heldAt < DANGLING_PATIENCE_MS) {
        if (g !== gen.current) return
        if (finalsRef.current.length !== count || vad.current.lastLoud > loudBefore + 1) break
        await new Promise((r) => window.setTimeout(r, 100))
      }
      if (finalsRef.current.length === count && vad.current.lastLoud <= loudBefore + 1) break // they really had finished
      // They carried on: wait for the rest of it to arrive, then look again.
      const grown = performance.now()
      while (performance.now() - grown < FINAL_SETTLE_MS * 2 && g === gen.current) await new Promise((r) => window.setTimeout(r, 100))
      text = finalsRef.current.slice(consumed.current).join(' ').trim()
    }
    const prevConsumed = consumed.current
    consumed.current = finalsRef.current.length
    // The rehearsal is in English: a line that is mostly another script is the room (a TV, a colleague), not the advisor.
    const letters = text.match(/\p{L}/gu) ?? []
    const latin = text.match(/\p{Script=Latin}/gu) ?? []
    if (letters.length >= 3 && latin.length / letters.length < 0.6) {
      dbg('ignored-background', { text: text.slice(0, 40) })
      setHint('I heard background speech and ignored it.')
      setBeatBoth('listening')
      return
    }
    if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 3) {
      consumed.current = prevConsumed
      setHint("I didn't quite catch that. Say it again?")
      setBeatBoth('listening')
      return
    }
    submitAdvisor(text, prevConsumed) // sent at once, but the microphone stays open until the reply starts to play
  }
  const endRef = useRef(endOfUtterance)
  endRef.current = endOfUtterance

  const onAmp = (amp: number) => {
    const b = beatRef.current
    if (b === 'thinking' && turnRef.current) {
      // The answer is out but the reply has not started: sustained voice means the advisor is carrying on.
      const v = vad.current
      v.floor = amp < v.floor * 1.6 ? v.floor * 0.94 + amp * 0.06 : v.floor * 0.998 + amp * 0.002
      if (amp > Math.max(0.06, v.floor * 2.6)) {
        v.loud++
        v.lastLoud = performance.now()
        if (v.loud >= 4) { v.loud = 0; dbg('amp-resume', { amp: Math.round(amp * 1000) / 1000, floor: Math.round(v.floor * 1000) / 1000 }); withdrawRef.current() }
      } else {
        v.loud = 0
      }
      return
    }
    if (b !== 'listening' && b !== 'hearing') return
    const v = vad.current
    const now = performance.now()
    v.floor = amp < v.floor * 1.6 ? v.floor * 0.94 + amp * 0.06 : v.floor * 0.998 + amp * 0.002
    const loud = amp > Math.max(0.05, v.floor * 2.4)
    if (loud) {
      v.loud++
      v.lastLoud = now
      if (v.loud >= 2 && !v.speaking) {
        v.speaking = true
        v.started = now
        setHint(null)
        setBeatBoth('hearing')
      }
    } else {
      v.loud = 0
    }
    if (v.speaking && now - v.lastLoud > FALLBACK_SILENCE_MS) {
      if (v.lastLoud - v.started < MIN_SPEECH_MS) {
        v.speaking = false
        setBeatBoth('listening')
      } else {
        void endRef.current()
      }
    }
  }
  const ampRef = useRef(onAmp)
  ampRef.current = onAmp

  useEffect(() => {
    capture.setRawAmpListener((a) => ampRef.current(a))
    capture.setSpeechResumedListener(() => { dbg('server-speech-resumed'); withdrawRef.current() })
    capture.setUtteranceEndListener(() => {
      serverEndAt.current = performance.now()
      dbg('server-utterance-end', { pending: !!turnRef.current, beat: beatRef.current })
      // Another end of utterance while the last answer is still unanswered means they carried on: take it back and send it once, whole.
      const pending = turnRef.current
      if (pending && finalsRef.current.length > pending.finalsAtSubmit) withdrawRef.current()
      else if (pending) return // a repeated end-of-speech signal with nothing new said: the answer stands
      const b = beatRef.current
      if (stageRef.current === 'rehearsing' && (b === 'listening' || b === 'hearing')) void endRef.current(true)
    })
    return () => {
      capture.setRawAmpListener(null)
      capture.setUtteranceEndListener(null)
      capture.setSpeechResumedListener(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** The orb: while the advisor is mid-answer it means "I'm done"; while the customer talks it cuts them off. */
  const tapMic = useCallback(() => {
    const b = beatRef.current
    if (b === 'hearing') void endRef.current()
    else if (b === 'speaking') {
      stopAudio()
    }
  }, [])

  // ── coach's notes ──
  const finish = useCallback(async () => {
    const g = ++gen.current
    stopAudio()
    setSpeaker(null)
    capture.reset()
    micOpen.current = false
    const lines = messagesRef.current.map((m) => ({ role: m.role, text: m.text }))
    setStageBoth('scoring')
    try {
      const s = await rehearsalScore(profileId, lines)
      if (g !== gen.current) return
      setScorecard(s)
      setStageBoth('done')
    } catch (e) {
      if (g !== gen.current) return
      setError(e instanceof Error ? e.message : "Could not write the coach's notes")
      setStageBoth('rehearsing')
      setBeatBoth('typing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  const reset = useCallback(() => {
    gen.current++
    stopAudio()
    capture.reset()
    micOpen.current = false
    briefRef.current = null
    setBrief(null)
    setList([])
    setScorecard(null)
    setError(null)
    setHint(null)
    setSpeaker(null)
    setStageBoth('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leaving the screen stops everything.
  useEffect(() => () => {
    gen.current++
    stopAudio()
  }, [])

  const caption = [...capture.finalSegments.slice(consumed.current), capture.partialText].filter(Boolean).join(' ').trim()
  const advisorRounds = messages.filter((m) => m.role === 'advisor').length

  return {
    stage, beat, speaker, brief, messages, scorecard, error, hint, caption, amplitude: capture.amplitude,
    timing: timing.current,
    voiceOn, setVoiceOn, startBrief, startRehearsal, submitAdvisor, tapMic, finish, reset,
    canScore: advisorRounds >= MIN_ROUNDS_FOR_NOTES,
    advisorRounds,
  }
}

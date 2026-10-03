import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { discardConversation, junoSpeak, junoTurn, junoVoiceStatus } from '../api/client'
import type { useVoiceCapture } from './useVoiceCapture'

type Voice = ReturnType<typeof useVoiceCapture>

export type JunoStage = 'idle' | 'connecting' | 'consent' | 'discovery' | 'wrapup' | 'declined' | 'finished' | 'error'

export interface JunoTurn {
  id: number
  role: 'juno' | 'customer'
  text: string
}

/** The six things Juno gets to know, in the order it naturally raises them. */
export const JUNO_TOPICS = [
  { key: 'about', label: 'About you' },
  { key: 'family', label: 'Family' },
  { key: 'goals', label: 'Goals' },
  { key: 'concerns', label: 'Concerns' },
  { key: 'money', label: 'Budget' },
  { key: 'cover', label: 'Existing cover' },
] as const

const GREETING =
  "Hello, I'm Juno, your AIA Singapore digital and recommendation assistant. Before we begin, with your permission I'd like to record and analyse our conversation, so your advisor can help you better. Is that all right?"

// ── Turn-taking ─────────────────────────────────────────────────────────────────────────────────────────────
// Juno decides an answer is over from the customer's VOICE (not from the transcript, which lags the speech by a
// second or two), commits it for transcription at once, and replies as soon as the text lands.
/** Quiet this long after speech → the answer is committed for transcription. */
const COMMIT_QUIET_MS = 800
/**
 * How long Juno waits after the customer goes quiet before it takes over, by how finished the answer sounds:
 * a short answer ("Yes.") is quick; a full sentence waits a natural breath; a sentence that trails off
 * ("…and we also have a") waits longest. If the customer carries on after Juno has started thinking, its reply
 * is thrown away and it keeps listening, so being a little eager costs nothing.
 */
const END_SHORT_MS = 900
const END_SENTENCE_MS = 1500
const END_TRAILING_MS = 3000
/** Questions that invite a long, thoughtful answer (worries, hopes, family): the customer is allowed longer pauses. */
const OPEN_QUESTION = /(worr|concern|hope|goal|plan|tell me|family|anyone you|live with|support|share|what are|how do you feel|on your mind)/i
const END_SHORT_OPEN_MS = 1400
const END_SENTENCE_OPEN_MS = 2400
/**
 * A reply that is ready is still held until the customer has been quiet this long, so a pause in the middle of an
 * answer is never talked over — Juno checks, right up to the moment it speaks, that the customer has not carried on.
 */
const HOLD_QUIET_MS = 1700
const HOLD_QUIET_OPEN_MS = 2600
const HOLD_MAX_MS = 4500
const TRAILING = /(\b(and|but|so|because|then|or|also|like|um|uh|er|erm|well|if|when|that|which|with|to|of|for|in|on|at|my|our|the|a|an|is|are|was|were|i|we)\b|[,;:–-]|\.\.\.|…)\s*$/i
function endpointMs(text: string, open: boolean): number {
  const t = text.trim()
  const sentenceEnd = /[.!?]["')]?$/.test(t)
  if (TRAILING.test(t) || !sentenceEnd) return END_TRAILING_MS
  const short = t.split(/\s+/).length <= 3
  return open ? (short ? END_SHORT_OPEN_MS : END_SENTENCE_OPEN_MS) : short ? END_SHORT_MS : END_SENTENCE_MS
}
/** After the last text arrives, wait this long for a trailing piece before replying. */
const SETTLE_MS = 350
/** A committed answer that produces no text within this long was noise (or too short to transcribe). */
const NO_TEXT_MS = 4000
/** How long we expect a committed answer to take to come back as text. */
const IN_FLIGHT_MS = 2500
/** Text that has been sitting this long after the customer stopped is answered regardless. */
const MAX_WAIT_MS = 6000
/** Voice louder than this (and well above the room's noise) counts as the customer speaking. */
const MIN_VOICE = 0.07
const NOISE_FLOOR_MAX = 0.05
const HEARD_MS = 350
const NUDGE_AFTER_MS = 25000
// Always a short phrase, never a single word: the voice model renders a lone "Okay." unpredictably (it can come out in a different voice).
const ACKS = ['Mm, I see.', 'Okay, got it.', 'Right, thank you.', 'I see, thanks.', 'Alright, got it.']
/** A segment that is only one of Juno's own acknowledgements (heard back through the speakers) is not the customer. */
const ACK_ECHO = /^(mm+[\s,-]*(h?m+)?[\s,]*(i see)?|okay,?\s*(got it)?|ok|right,?\s*(thank you|thanks)?|i see,?\s*(okay|thanks)?|alright,?\s*(got it)?|got it|uh[\s-]*huh|mhm)[.!,\s]*$/i
const CHARS_PER_SEC = 13.5
const VOICE_KEY = 'vi_juno_voice_id'
const MUTE_KEY = 'vi_juno_silent'

// Only two voices are offered: one female, one male — the best the browser has for each.
const FEMALE = [/Samantha/i, /Google UK English Female/i, /Microsoft (Aria|Jenny|Sonia|Libby)/i, /Karen|Moira|Serena|Tessa|Allison|Ava/i]
const MALE = [/^Daniel/i, /Arthur/i, /Google UK English Male/i, /Microsoft (Guy|Ryan|Davis|Brian|Christopher)/i, /^Alex$/i, /Oliver/i]

function firstMatch(voices: SpeechSynthesisVoice[], list: RegExp[]): SpeechSynthesisVoice | null {
  for (const re of list) {
    const hits = voices.filter((x) => re.test(x.name))
    // The richer "Enhanced / Premium / Natural" variants sound far more human, so they win when installed.
    const v = hits.find((x) => /premium|enhanced|natural/i.test(x.name)) ?? hits[0]
    if (v) return v
  }
  return null
}

export type VoiceId = 'female' | 'male'

/**
 * Directs a conversation in which Juno talks with the customer by itself: it greets, asks for consent, listens,
 * asks the next question, and hands over to the advisor. It can only speak and listen — whatever happens next
 * (starting the analysis) is a button only the advisor can press.
 */
export function useJuno(voice: Voice) {
  const [stage, setStage] = useState<JunoStage>('idle')
  const [turns, setTurns] = useState<JunoTurn[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [covered, setCovered] = useState<string[]>([])
  const [line, setLine] = useState('')
  const [revealed, setRevealed] = useState(0)
  const [silent, setSilent] = useState(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
  })
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  /** Juno's neural voice (Azure OpenAI): null while we find out, then true/false. */
  const [neural, setNeural] = useState<{ female: string; male: string } | null | false>(null)
  const neuralRef = useRef<{ female: string; male: string } | null | false>(null)
  neuralRef.current = neural
  const audioCache = useRef(new Map<string, Promise<Blob | null>>())
  const playing = useRef<HTMLAudioElement | null>(null)
  const [voiceId, setVoiceId] = useState<VoiceId>(() => {
    try { return localStorage.getItem(VOICE_KEY) === 'male' ? 'male' : 'female' } catch { return 'female' }
  })

  const stageRef = useRef<JunoStage>('idle')
  const turnsRef = useRef<JunoTurn[]>([])
  const idRef = useRef(0)
  /** Bumped whenever the conversation is reset or ended, so anything still in flight from before knows to stand down. */
  const gen = useRef(0)
  const awaiting = useRef(false) // true while Juno is waiting for the customer to answer
  const pending = useRef('')
  const nudgeTimer = useRef<number | null>(null)
  const busy = useRef(false)
  /** True while a full line from Juno is being spoken. */
  const busyTalking = useRef(false)
  const seenSegments = useRef(0)
  const speakTimers = useRef<number[]>([])
  // Endpointing
  const lastLoud = useRef(0)
  const lastText = useRef(0)
  const lastAmpAt = useRef(0)
  const loudMs = useRef(0)
  const noiseFloor = useRef(0.03)
  const committedAt = useRef(0)
  const inFlight = useRef(false)
  const acked = useRef(false)
  const ackIdx = useRef(0)
  // The customer carrying on while Juno is still working out its reply
  const resumedMs = useRef(0)
  /** While the "Mm-hm" is playing its echo can reach the mic: it must not be mistaken for the customer carrying on. */
  const ackUntil = useRef(0)
  /** The question Juno just asked invites a long answer (so pauses are allowed to be longer). */
  const openQuestion = useRef(false)
  const late = useRef('')

  const silentRef = useRef(silent)
  const chosen = useRef<SpeechSynthesisVoice | null>(null)
  const voiceIdRef = useRef<VoiceId>('female')
  const voiceApi = useRef(voice)
  voiceApi.current = voice
  silentRef.current = silent
  voiceIdRef.current = voiceId
  stageRef.current = stage

  const setStageBoth = useCallback((s: JunoStage) => {
    stageRef.current = s
    setStage(s)
  }, [])

  useEffect(() => {
    void junoVoiceStatus().then((st) => setNeural(st.enabled ? st.voices : false))
  }, [])

  // The browser loads its voices asynchronously.
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)))
    load()
    speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => speechSynthesis.removeEventListener?.('voiceschanged', load)
  }, [])

  const voiceChoices = useMemo(() => {
    if (neural) {
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
      return [
        { id: 'female' as VoiceId, name: cap(neural.female), voice: null },
        { id: 'male' as VoiceId, name: cap(neural.male), voice: null },
      ]
    }
    const f = firstMatch(voices, FEMALE)
    const m = firstMatch(voices, MALE)
    const clean = (v: SpeechSynthesisVoice) =>
      v.name.replace(/\s*\((Enhanced|Premium|English.*)\)/i, '').replace(/^Microsoft\s+/i, '').replace(/\s+Online.*$/i, '').replace(/^Google\s+/i, '')
    const out: { id: VoiceId; name: string; voice: SpeechSynthesisVoice | null }[] = []
    if (f) out.push({ id: 'female', name: clean(f), voice: f })
    if (m) out.push({ id: 'male', name: clean(m), voice: m })
    return out
  }, [voices, neural])
  useEffect(() => {
    // Browser voice used only if the neural voice ever fails: the same gender as the one chosen, never a stray default.
    chosen.current = voiceChoices.find((c) => c.id === voiceId)?.voice ?? firstMatch(voices, voiceId === 'male' ? MALE : FEMALE) ?? voices[0] ?? null
  }, [voiceChoices, voiceId, voices])

  const chooseVoice = useCallback((id: VoiceId) => {
    setVoiceId(id)
    try { localStorage.setItem(VOICE_KEY, id) } catch { /* not remembering is fine */ }
  }, [])
  const toggleSilent = useCallback(() => {
    setSilent((s) => {
      try { localStorage.setItem(MUTE_KEY, s ? '0' : '1') } catch { /* not remembering is fine */ }
      return !s
    })
  }, [])

  const clearTimers = useCallback(() => {
    if (nudgeTimer.current) window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = null
    speakTimers.current.forEach((t) => window.clearInterval(t))
    speakTimers.current = []
  }, [])

  const addTurn = useCallback((role: JunoTurn['role'], text: string) => {
    const t = { id: ++idRef.current, role, text }
    turnsRef.current = [...turnsRef.current, t]
    setTurns(turnsRef.current)
  }, [])

  /** Audio for one sentence, fetched once and shared: asking early (prefetch) makes the line play with no wait. */
  const audioFor = useCallback((text: string, tone: string): Promise<Blob | null> => {
    const key = `${voiceIdRef.current}|${tone}|${text}`
    let p = audioCache.current.get(key)
    if (!p) {
      p = junoSpeak(text, voiceIdRef.current, tone).then((b) => {
        if (!b && audioCache.current.get(key) === p) audioCache.current.delete(key) // a failure is not remembered
        return b
      })
      audioCache.current.set(key, p)
      if (audioCache.current.size > 120) audioCache.current.delete(audioCache.current.keys().next().value as string)
    }
    return p
  }, [])

  /** Splits a line into sentences (short ones joined to the next) so each can be spoken, and fetched, on its own. */
  const sentences = useCallback((text: string) => {
    const parts: { text: string; at: number }[] = []
    const re = /[^.!?]+[.!?]*\s*/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const t = m[0].trim()
      if (!t) continue
      const last = parts[parts.length - 1]
      if (last && last.text.length < 28) last.text = `${last.text} ${t}`
      else parts.push({ text: t, at: m.index })
    }
    return parts.length ? parts : [{ text, at: 0 }]
  }, [])

  const stopAudio = useCallback(() => {
    const a = playing.current
    if (a) {
      a.onended = null
      a.onerror = null
      a.pause()
      playing.current = null
    }
  }, [])

  /** Get the greeting and the "Mm-hm" clips ready before they are needed, so they play instantly. */
  const prewarm = useCallback(() => {
    if (!neuralRef.current) return
    sentences(GREETING).forEach((p) => void audioFor(p.text, 'warm'))
    ACKS.forEach((t) => void audioFor(t, 'warm'))
  }, [audioFor, sentences])
  useEffect(() => {
    if (neural) prewarm()
  }, [neural, voiceId, prewarm])

  /** A very short spoken "Mm-hm" while Juno works out its reply — it is not part of the conversation record. */
  const acknowledge = useCallback(() => {
    if (silentRef.current) return
    const g = gen.current
    const text = ACKS[ackIdx.current++ % ACKS.length]
    const done = () => {
      // The reply may already be speaking (and holding the mic closed): only reopen if nothing else is.
      if (g === gen.current && !busyTalking.current) voiceApi.current.setMicMuted(false)
    }
    if (neuralRef.current) {
      // Only a clip that is already in hand is used: an ack that arrives late is worse than none.
      const key = `${voiceIdRef.current}|warm|${text}`
      const pr = audioCache.current.get(key)
      if (!pr) return
      void Promise.race([pr, new Promise<null>((r) => window.setTimeout(() => r(null), 250))]).then((blob) => {
        if (!blob || g !== gen.current || busyTalking.current) return
        // The microphone stays open: a customer who resumes speaking right now must not lose a single word.
        ackUntil.current = performance.now() + 900
        voiceApi.current.setLearning(false)
        window.setTimeout(() => voiceApi.current.setLearning(true), 1300)
        const a = new Audio(URL.createObjectURL(blob))
        a.volume = 0.8
        playing.current = a
        void a.play().catch(() => undefined)
      })
      return
    }
    if (typeof speechSynthesis === 'undefined') return
    voiceApi.current.setMicMuted(true)
    const u = new SpeechSynthesisUtterance(text)
    if (chosen.current) {
      u.voice = chosen.current
      u.lang = chosen.current.lang
    }
    u.rate = 0.98
    u.onend = done
    u.onerror = done
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }, [])

  /** Juno says something aloud (mic muted meanwhile), with captions paced to the speech. Resolves when finished. */
  const speak = useCallback(
    (text: string, tone = 'warm') =>
      new Promise<void>((resolve) => {
        const v = voiceApi.current
        const g = gen.current
        awaiting.current = false
        pending.current = ''
        openQuestion.current = OPEN_QUESTION.test(text)
        busyTalking.current = true
        v.setMicMuted(true)
        v.commitNow()
        v.sendAgentSay(text)
        addTurn('juno', text)
        setLine(text)
        setRevealed(0)
        setSpeaking(true)

        let finished = false
        const estimateMs = Math.max(1400, (text.length / CHARS_PER_SEC) * 1000)
        const started = performance.now()
        let boundary = 0
        let audioReveal = 0
        const tick = window.setInterval(() => {
          const est = Math.floor(((performance.now() - started) / 1000) * CHARS_PER_SEC)
          setRevealed(Math.min(text.length, Math.max(boundary, audioReveal, neuralRef.current ? 0 : est)))
        }, 60)
        speakTimers.current.push(tick)

        const finish = () => {
          if (finished) return
          finished = true
          window.clearInterval(tick)
          busyTalking.current = false
          if (g !== gen.current) return resolve() // the conversation was ended or reset meanwhile
          setRevealed(text.length)
          setSpeaking(false)
          // A beat after the last word, so the room's echo has died before the mic opens again.
          window.setTimeout(() => {
            if (g === gen.current) voiceApi.current.setMicMuted(false)
            resolve()
          }, 250)
        }

        if (silentRef.current) {
          window.setTimeout(finish, estimateMs)
          return
        }
        const parts = sentences(text)

        // The browser's own voice: a sentence at a time, unhurried, with a small breath between them.
        const male = voiceIdRef.current === 'male'
        const browserFrom = (i: number) => {
          if (typeof speechSynthesis === 'undefined') return window.setTimeout(finish, estimateMs)
          if (i === 0) speechSynthesis.cancel()
          const sayPart = (j: number) => {
            if (finished || g !== gen.current) return finish()
            const u = new SpeechSynthesisUtterance(parts[j].text)
            if (chosen.current) {
              u.voice = chosen.current
              u.lang = chosen.current.lang
            }
            u.rate = male ? 0.9 : 0.93
            u.pitch = male ? 0.92 : 1.02
            u.onboundary = (e) => { boundary = Math.max(boundary, parts[j].at + e.charIndex) }
            u.onend = () => {
              if (j + 1 >= parts.length) return finish()
              window.setTimeout(() => sayPart(j + 1), /\?\s*$/.test(parts[j].text) ? 420 : 280)
            }
            u.onerror = finish
            speechSynthesis.speak(u)
          }
          sayPart(i)
        }

        if (neuralRef.current) {
          // Juno's neural voice. Every sentence is requested at once, and played in order as each is ready.
          const clips = parts.map((p) => audioFor(p.text, tone))
          const playPart = async (i: number): Promise<void> => {
            if (finished || g !== gen.current) return finish()
            const blob = await clips[i]
            if (finished || g !== gen.current) return finish()
            if (!blob) {
              // The neural voice failed for this line: carry on with the browser's voice so the conversation never stalls.
              if (i === 0) setNeural(false)
              return void browserFrom(i)
            }
            const a = new Audio(URL.createObjectURL(blob))
            a.playbackRate = 1.06 // a touch brisker than the model's own pace
            playing.current = a
            const reveal = window.setInterval(() => {
              if (a.duration > 0) audioReveal = Math.max(audioReveal, parts[i].at + Math.floor(parts[i].text.length * Math.min(1, a.currentTime / a.duration)))
            }, 50)
            speakTimers.current.push(reveal)
            const next = () => {
              window.clearInterval(reveal)
              audioReveal = Math.max(audioReveal, parts[i].at + parts[i].text.length)
              if (i + 1 >= parts.length) return finish()
              window.setTimeout(() => void playPart(i + 1), 90)
            }
            a.onended = next
            let retried = false
            const failed = () => {
              if (!retried && g === gen.current) {
                retried = true // one more try before ever switching voice
                window.setTimeout(() => void a.play().catch(failed), 200)
                return
              }
              window.clearInterval(reveal)
              browserFrom(i)
            }
            a.onerror = failed
            a.play().catch(failed)
          }
          void playPart(0)
          window.setTimeout(finish, estimateMs * 2 + 20000)
          return
        }
        browserFrom(0)
        // Some browsers never fire onend; never let the conversation hang on that.
        window.setTimeout(finish, estimateMs * 1.9 + 3500)
      }),
    [addTurn, audioFor, sentences],
  )

  /** After Juno finishes speaking: listen for the customer's answer, nudging once if it stays quiet. */
  const listen = useCallback(
    (canNudge = true) => {
      const g = gen.current
      awaiting.current = true
      pending.current = ''
      const now = performance.now()
      lastLoud.current = lastText.current = lastAmpAt.current = now
      noiseFloor.current = Math.min(noiseFloor.current, NOISE_FLOOR_MAX)
      loudMs.current = 0
      committedAt.current = 0
      inFlight.current = false
      acked.current = false
      if (nudgeTimer.current) window.clearTimeout(nudgeTimer.current)
      nudgeTimer.current = null
      if (!canNudge) return
      nudgeTimer.current = window.setTimeout(async () => {
        if (g !== gen.current || !awaiting.current || pending.current || loudMs.current > 0 || busy.current) return
        await speak("Take your time. I'm listening.")
        if (g === gen.current) listen(false) // one nudge per question, never a loop
      }, NUDGE_AFTER_MS)
    },
    [speak],
  )

  const finishSession = useCallback(async () => {
    if (stageRef.current === 'declined') return
    setStageBoth('wrapup')
    awaiting.current = false
    voiceApi.current.setMicMuted(true)
    voiceApi.current.stop() // the server finalises the profile and the last analysis; 'stopped' follows
  }, [setStageBoth])

  /** The customer has finished answering: ask the brain what Juno says next, then say it. */
  const respond = useCallback(
    async (answer: string) => {
      if (busy.current) return
      const g = gen.current
      busy.current = true
      awaiting.current = false
      if (nudgeTimer.current) window.clearTimeout(nudgeTimer.current)
      addTurn('customer', answer)
      setThinking(true)
      resumedMs.current = 0
      late.current = ''
      const consentPhase = stageRef.current === 'consent'
      const t0 = performance.now()
      // A short "Mm-hm" covers the moment Juno is working out its reply (only for a real answer, not the consent tap).
      if (!consentPhase && answer.split(/\s+/).length >= 4) acknowledge()
      try {
        const res = await junoTurn({
          profileId: voiceApi.current.profile?.id,
          phase: consentPhase ? 'consent' : 'discovery',
          turns: turnsRef.current.map(({ role, text }) => ({ role, text })),
        })
        if (g !== gen.current) return
        // Hold a ready reply until the customer has been quiet long enough: a pause mid-answer is not an ending.
        const holdMs = openQuestion.current ? HOLD_QUIET_OPEN_MS : HOLD_QUIET_MS
        while (performance.now() - lastLoud.current < holdMs && performance.now() - t0 < HOLD_MAX_MS) {
          await new Promise((r) => window.setTimeout(r, 100))
          if (g !== gen.current) return
        }
        if (g !== gen.current) return
        // The customer carried on speaking while Juno was working out its reply: that reply answers half an
        // answer, so drop it, keep what they said, and keep listening for the rest.
        if (resumedMs.current >= 500 || late.current.trim()) {
          const merged = `${answer} ${late.current}`.trim()
          turnsRef.current = turnsRef.current.slice(0, -1)
          setTurns(turnsRef.current)
          setThinking(false)
          awaiting.current = true
          pending.current = merged
          const t = performance.now()
          lastLoud.current = lastText.current = lastAmpAt.current = t
          loudMs.current = HEARD_MS
          committedAt.current = late.current.trim() ? 0 : t
          inFlight.current = !late.current.trim() // more words are still on their way back as text
          acked.current = false
          return
        }
        setThinking(false)
        console.debug(`[juno] reply ready in ${Math.round(performance.now() - t0)} ms`)
        if (res.covered?.length) setCovered((c) => [...new Set([...c, ...res.covered])])

        if (res.consent === 'declined') {
          setStageBoth('declined')
          await speak(res.say, 'gentle')
          if (g !== gen.current) return
          const id = voiceApi.current.profile?.id
          voiceApi.current.reset()
          if (id) await discardConversation(id)
          return
        }
        if (res.consent === 'granted') setStageBoth('discovery')
        await speak(res.say, res.tone)
        if (g !== gen.current) return
        if (res.done) {
          setCovered(JUNO_TOPICS.map((t) => t.key))
          await finishSession()
        } else {
          listen()
        }
      } catch {
        if (g !== gen.current) return
        setThinking(false)
        await speak('Sorry, I missed that. Could you say it once more?')
        if (g === gen.current) listen()
      } finally {
        busy.current = false
      }
    },
    [acknowledge, addTurn, finishSession, listen, setStageBoth, speak],
  )

  // ── Watching the customer ────────────────────────────────────────────────────────────────────────────────
  const { finalSegments, status, amplitude } = voice
  useEffect(() => {
    if (finalSegments.length < seenSegments.current) seenSegments.current = 0
    const fresh = finalSegments.slice(seenSegments.current)
    seenSegments.current = finalSegments.length
    // Only in the moments right after Juno's own "Mm-hm": otherwise a real "Okay." from the customer is an answer.
    const echoWindow = performance.now() < ackUntil.current + 2500
    const realText = fresh.filter((t) => !(echoWindow && ACK_ECHO.test(t.trim())))
    if (realText.length && busy.current && !busyTalking.current) late.current = `${late.current} ${realText.join(' ')}`.trim()
    if (!awaiting.current || busy.current || realText.length === 0) return
    pending.current = `${pending.current} ${realText.join(' ')}`.trim()
    lastText.current = performance.now()
    inFlight.current = false // the committed speech has come back as text
  }, [finalSegments])

  // Microphone level: is the customer speaking right now?
  useEffect(() => {
    if (busy.current && !busyTalking.current) {
      // Juno is thinking and the customer is talking again.
      if (performance.now() > ackUntil.current && amplitude > Math.max(MIN_VOICE, noiseFloor.current * 2.4)) {
        resumedMs.current += 100
        lastLoud.current = performance.now()
      }
      return
    }
    if (!awaiting.current || busy.current) return
    const now = performance.now()
    const dt = Math.min(250, now - lastAmpAt.current)
    lastAmpAt.current = now
    const threshold = Math.max(MIN_VOICE, noiseFloor.current * 2.4)
    if (amplitude > threshold) {
      lastLoud.current = now
      loudMs.current += dt
      if (committedAt.current) {
        committedAt.current = 0 // they carried on: wait for more
        acked.current = false
      }
    } else {
      // The room's noise level can never be mistaken for more than this, or it would ratchet upward until speech no longer counts.
      noiseFloor.current = Math.min(NOISE_FLOOR_MAX, noiseFloor.current + (amplitude - noiseFloor.current) * 0.03)
    }
  }, [amplitude])

  // The endpointing loop: commit when the customer goes quiet, acknowledge, reply once the text has landed.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!awaiting.current || busy.current) return
      const now = performance.now()
      const quietFor = now - lastLoud.current
      const heard = loudMs.current >= HEARD_MS

      if (heard && !committedAt.current && quietFor >= COMMIT_QUIET_MS) {
        committedAt.current = now
        inFlight.current = true
        voiceApi.current.commitNow()
      }
      // A committed answer that never came back as text was noise or too short to transcribe: start again.
      if (committedAt.current && !pending.current && now - committedAt.current > NO_TEXT_MS) {
        committedAt.current = 0
        loudMs.current = 0
        inFlight.current = false
        acked.current = false
        return
      }
      if (inFlight.current && now - committedAt.current > IN_FLIGHT_MS) inFlight.current = false
      const text = pending.current.trim()
      if (!text || text.length < 2) return
      const textSettled = now - lastText.current >= SETTLE_MS
      const quiet = quietFor >= endpointMs(text, openQuestion.current)
      const stale = now - lastText.current >= MAX_WAIT_MS && quietFor >= COMMIT_QUIET_MS
      if ((quiet && textSettled && !inFlight.current) || stale) void respond(text)
    }, 100)
    return () => window.clearInterval(id)
  }, [respond])

  // Juno opens the conversation as soon as the microphone is live.
  useEffect(() => {
    if (stageRef.current === 'connecting' && status === 'listening') {
      const g = gen.current
      setStageBoth('consent')
      void speak(GREETING).then(() => g === gen.current && listen())
    }
    if (status === 'stopped' && (stageRef.current === 'wrapup' || stageRef.current === 'discovery' || stageRef.current === 'consent')) {
      setStageBoth('finished')
    }
    if (status === 'error' && stageRef.current !== 'idle') setStageBoth('error')
  }, [status, speak, listen, setStageBoth])

  const reset = useCallback(() => {
    gen.current++
    clearTimers()
    stopAudio()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    awaiting.current = false
    busy.current = false
    busyTalking.current = false
    pending.current = ''
    seenSegments.current = 0
    committedAt.current = 0
    inFlight.current = false
    turnsRef.current = []
    setTurns([])
    setCovered([])
    setLine('')
    setRevealed(0)
    setSpeaking(false)
    setThinking(false)
    setStageBoth('idle')
  }, [clearTimers, setStageBoth, stopAudio])

  const start = useCallback(async () => {
    reset()
    prewarm()
    noiseFloor.current = 0.03 // a fresh conversation starts with a fresh idea of the room
    setStageBoth('connecting')
    // Speech synthesis needs a user gesture: speaking an empty phrase now unlocks it for later.
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.speak(new SpeechSynthesisUtterance(''))
    await voiceApi.current.start('juno')
  }, [reset, prewarm, setStageBoth])

  /** The customer tapped Yes/No on screen instead of answering aloud. */
  const answerConsent = useCallback(
    (yes: boolean) => {
      if (stageRef.current !== 'consent' || busy.current) return
      void respond(yes ? 'Yes, that is fine.' : 'No, I would rather not.')
    },
    [respond],
  )

  /** End now: Juno stops talking and listening immediately; what was said so far is kept and handed to the advisor. */
  const end = useCallback(() => {
    gen.current++ // everything still in flight (a nudge, a reply, a pending answer) stands down
    clearTimers()
    stopAudio()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    awaiting.current = false
    busy.current = false
    busyTalking.current = false
    pending.current = ''
    setSpeaking(false)
    setThinking(false)
    voiceApi.current.setMicMuted(true)
    if (stageRef.current === 'consent' || stageRef.current === 'connecting') {
      // Nothing has been agreed to yet, so nothing is kept.
      const id = voiceApi.current.profile?.id
      voiceApi.current.reset()
      if (id) void discardConversation(id)
      reset()
      return
    }
    setStageBoth('wrapup')
    voiceApi.current.stop()
  }, [clearTimers, reset, setStageBoth, stopAudio])

  useEffect(() => () => {
    gen.current++
    clearTimers()
    stopAudio()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }, [clearTimers, stopAudio])

  const listening = !speaking && !thinking && (stage === 'consent' || stage === 'discovery')
  const progress = useMemo(() => covered.filter((c) => JUNO_TOPICS.some((t) => t.key === c)).length, [covered])

  return {
    stage, turns, speaking, thinking, listening, covered, line, revealed, progress,
    silent, toggleSilent, voiceChoices, voiceId, chooseVoice,
    start, end, reset, answerConsent,
  }
}

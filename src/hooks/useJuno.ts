import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { junoDebriefPrepare, junoDebriefTurn, junoPhrases, type FactFindReadiness, junoSpeak, junoVoiceStatus, type JunoPhrases, type JunoTurnResponse, type LangId } from '../api/client'
import type { useVoiceCapture } from './useVoiceCapture'

type Voice = ReturnType<typeof useVoiceCapture>

/** dictate: the advisor briefs Juno freely. discovery: Juno asks about the gaps. wrapup: Juno reads back and the session is saved. */
export type JunoStage = 'idle' | 'connecting' | 'dictate' | 'discovery' | 'wrapup' | 'finished' | 'error'

export interface JunoTurn {
  id: number
  role: 'juno' | 'advisor'
  text: string
}

/** The six things a complete record holds, in the order Juno naturally raises them. */
export const JUNO_TOPICS = [
  { key: 'about', label: 'About you' },
  { key: 'family', label: 'Family' },
  { key: 'goals', label: 'Goals' },
  { key: 'concerns', label: 'Concerns' },
  { key: 'money', label: 'Budget' },
  { key: 'cover', label: 'Existing cover' },
] as const

export type { LangId }

/** The languages Juno speaks. English is the default; the others are chosen on the stage (before or during the conversation). */
export const LANGUAGES: { id: LangId; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'zh', label: '中文', name: 'Chinese' },
  { id: 'ms', label: 'BM', name: 'Bahasa Melayu' },
  { id: 'ta', label: 'தமிழ்', name: 'Tamil' },
]

/** Used only if the server can't be reached for the fixed lines; the real ones (all four languages) come from the server. */
const EN_PHRASES: JunoPhrases = {
  language: 'English',
  greeting: "Hello, I'm Juno, your AIA Singapore digital and recommendation assistant. Before we begin, with your permission I'd like to record and analyse our conversation, so your advisor can help you better. Is that all right?",
  declined: "Of course, that's completely fine. I won't keep anything from this chat. Your advisor will be happy to take it from here.",
  unclear: "Sorry, I didn't quite catch that. Is it all right if I record and analyse our chat, so your advisor can help you better? A simple yes or no is fine.",
  firstQuestion: 'Thank you. To start, could I have your name?',
  closing: "That's really helpful, thank you. Before I hand you over to your advisor, is there anything you'd like to ask me?",
  wrap: 'Thank you so much for sharing all of that. Your advisor will review everything and take it from here.',
  askAway: 'Of course. What would you like to ask?',
  tellMore: 'Thank you. Could you tell me a little more about that?',
  noFigures: "I can't give figures like that, as they depend on your situation.",
  nudge: "Take your time. I'm listening.",
  missed: 'Sorry, I missed that. Could you say it once more?',
  anythingElse: "Is there anything else you'd like to ask?",
  yes: "Yes, that's fine",
  no: 'No thanks',
  yesText: 'Yes, that is fine.',
  noText: 'No, I would rather not.',
  acks: ['Mm, I see.', 'Okay, got it.', 'Right, thank you.', 'I see, thanks.', 'Alright, got it.'],
}

// ── Turn-taking ─
// Tuned for pace: an advisor's answers to Juno are short and factual, and a reply that arrives while they carry on is simply
// dropped (they are heard out first), so Juno can afford to answer quickly.────────────────────────────────────────────────────────────────────────────────────────────
// Juno decides an answer is over from the advisor's VOICE (not from the transcript, which lags the speech by a
// second or two), commits it for transcription at once, and replies as soon as the text lands.
/** Quiet this long after speech → the answer is committed for transcription. */
const COMMIT_QUIET_MS = 600
/**
 * How long Juno waits after the advisor goes quiet before it takes over, by how finished the answer sounds:
 * a short answer ("Yes.") is quick; a full sentence waits a natural breath; a sentence that trails off
 * ("…and we also have a") waits longest. If the advisor carries on after Juno has started thinking, its reply
 * is thrown away and it keeps listening, so being a little eager costs nothing.
 */
const END_SHORT_MS = 650
const END_SENTENCE_MS = 1050
const END_TRAILING_MS = 2400
/** Questions that invite a long, thoughtful answer (worries, hopes, family): the advisor is allowed longer pauses. */
const OPEN_QUESTION = /(worr|concern|hope|goal|plan|tell me|family|anyone you|live with|support|share|what are|how do you feel|on your mind)/i
const END_SHORT_OPEN_MS = 1000
const END_SENTENCE_OPEN_MS = 1700
/**
 * A reply that is ready is still held until the advisor has been quiet this long, so a pause in the middle of an
 * answer is never talked over — Juno checks, right up to the moment it speaks, that the advisor has not carried on.
 */
const HOLD_QUIET_MS = 1100
const HOLD_QUIET_OPEN_MS = 1700
const HOLD_MAX_MS = 4500
const TRAILING = /(\b(and|but|so|because|then|or|also|like|um|uh|er|erm|well|if|when|that|which|with|to|of|for|in|on|at|my|our|the|a|an|is|are|was|were|i|we)\b|[,;:–-]|\.\.\.|…)\s*$/i
const TRAILING_PUNCT = /([,;:–\-、，；：]|\.\.\.|…)\s*$/
function endpointMs(text: string, open: boolean, lang: LangId): number {
  const t = text.trim()
  const sentenceEnd = /[.!?。！？]["')”]?$/.test(t)
  // The word list is English; for the other languages only punctuation says a sentence trails off.
  if ((lang === 'en' ? TRAILING.test(t) : TRAILING_PUNCT.test(t)) || !sentenceEnd) return END_TRAILING_MS
  const short = lang === 'zh' ? t.length <= 6 : t.split(/\s+/).length <= 3
  return open ? (short ? END_SHORT_OPEN_MS : END_SENTENCE_OPEN_MS) : short ? END_SHORT_MS : END_SENTENCE_MS
}
/** After the last text arrives, wait this long for a trailing piece before replying. */
const SETTLE_MS = 250
/** A committed answer that produces no text within this long was noise (or too short to transcribe). */
const NO_TEXT_MS = 4000
/** How long we expect a committed answer to take to come back as text. */
const IN_FLIGHT_MS = 2500
/** "Juno, over to you" (or "your turn", "go ahead"): hands the debrief to Juno without touching the screen. */
const HANDOVER = /\b(?:juno|juneau|junior|jeno|jonno)\b[\s,.!:-]*(?:over to you|your turn|go ahead|please go ahead|you can (?:start|go|begin)|over to you now)|(?:over to you|your turn)[\s,.!-]*\b(?:juno|juneau|junior|jeno|jonno)\b/i
/**
 * The speech model often hears "Juno" as something else ("you know"), so a line that is only "Over to you." / "Your turn." is
 * accepted as the hand-over too. It has to be the whole line, so "…then I handed it over to you" never triggers it.
 */
const HANDOVER_ALONE = /^\W*(?:(?:ok|okay|right|so|alright)\W+)?(?:over to you|your turn|go ahead|you can (?:start|go|begin)(?: now)?|over to you now)\W*$/i
/** A greeting or sign-off is never an answer to a debrief question: the speech model produces them ("Hi.") from room noise. */
const NOT_AN_ANSWER = /^(?:\W*(?:hi|hello|hey|bye|goodbye|thanks?|thank you)\b\W*)+$/i
const LEADING_GREETING = /^(?:[\s.,!?]*\b(?:hi|hello|hey|hola)\b)+[\s.,!?]*/i
const TRAILING_GREETING = /(?:[\s.,!?]*\b(?:hi|hello|hey|hola|bye|goodbye|thanks?|thank you)\b)+[\s.,!?]*$/i
const ORPHAN_WORD = /([.!?])\s*(?:the|a|an|and|but|so|um|uh)[\s.,!?]*$/i
/**
 * An answer as the advisor meant it: the speech model sometimes glues a greeting or a half word onto the end of a real answer
 * ("…his son is three. Hola. Hello. The"). Those are dropped; what is left is what was said.
 */
function cleanAnswer(raw: string): string {
  let t = raw.trim()
  for (let i = 0; i < 2; i++) {
    t = t.replace(ORPHAN_WORD, '$1').replace(TRAILING_GREETING, '').trim()
  }
  return t.replace(LEADING_GREETING, '').trim()
}
/** Text that has been sitting this long after the advisor stopped is answered regardless. */
const MAX_WAIT_MS = 6000
/** Voice louder than this (and well above the room's noise) counts as the advisor speaking. */
const MIN_VOICE = 0.07
const NOISE_FLOOR_MAX = 0.05
const HEARD_MS = 350
const NUDGE_AFTER_MS = 25000
// Acknowledgements are always a short phrase, never a single word: the voice model renders a lone "Okay." unpredictably.
/** A segment that is only one of Juno's own acknowledgements (heard back through the speakers) is not the advisor. */
const ACK_ECHO = /^(mm+[\s,-]*(h?m+)?[\s,]*(i see)?|okay,?\s*(got it)?|ok|right,?\s*(thank you|thanks)?|i see,?\s*(okay|thanks)?|alright,?\s*(got it)?|got it|uh[\s-]*huh|mhm)[.!,\s]*$/i
/** Rough speaking speed (characters per second), used for caption timing when the audio's own timing isn't available. */
const CPS: Record<LangId, number> = { en: 13.5, zh: 4.5, ms: 13, ta: 11 }
/** Output devices that are headphones/earpieces: Juno's voice can't leak back into the microphone, so interruption is safe. */
const HEADSET = /head(set|phone)|airpods|earbuds?|earphones?|buds|bluetooth|beats|jabra|bose|wh-1000|wf-1000/i
const BARGE_KEY = 'vi_juno_barge'
type BargeMode = 'auto' | 'on' | 'off'
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
 * Directs a debrief in which Juno works with the advisor after a meeting: the advisor dictates freely, taps
 * "Done, over to Juno", and Juno says what it understood and asks a few short questions about what is missing,
 * then reads back. It can only speak and listen — whatever happens next (starting the analysis) is a button only
 * the advisor can press.
 */
export function useJuno(voice: Voice) {
  const [stage, setStage] = useState<JunoStage>('idle')
  const [turns, setTurns] = useState<JunoTurn[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [covered, setCovered] = useState<string[]>([])
  const [line, setLine] = useState('')
  /** How long the debrief took, from the first word of dictation to the read-back (null until it is over). */
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  /** Fact-find readiness (estimate), updated with every reply from Juno. */
  const [readiness, setReadiness] = useState<FactFindReadiness | null>(null)
  const startedAt = useRef(0)
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

  // The language of the conversation: English unless the advisor or advisor chooses another.
  const [lang, setLangState] = useState<LangId>('en')
  const langRef = useRef<LangId>('en')
  langRef.current = lang
  const [phrases, setPhrases] = useState<JunoPhrases>(EN_PHRASES)
  const phrasesRef = useRef<JunoPhrases>(EN_PHRASES)
  phrasesRef.current = phrases
  const phrasesCache = useRef(new Map<LangId, JunoPhrases>())
  /** What the advisor dictated before handing over; sent with every turn so Juno never asks about what was already said. */
  const dictationRef = useRef('')

  // Interruption: the advisor can cut in while Juno is speaking. Automatic with headphones; the advisor can force it on or off.
  const [bargeMode, setBargeModeState] = useState<BargeMode>(() => {
    try { const v = localStorage.getItem(BARGE_KEY); return v === 'on' || v === 'off' ? v : 'auto' } catch { return 'auto' }
  })
  const [headset, setHeadset] = useState(false)
  const bargeEnabled = bargeMode === 'on' || (bargeMode === 'auto' && headset)
  const bargeRef = useRef(false)
  bargeRef.current = bargeEnabled
  const bargeable = useRef(false) // true while a line that may be interrupted is being spoken
  const lineStartedAt = useRef(0)
  const echoSamples = useRef<number[]>([])
  const bargeStreak = useRef(0)
  const interruptSpeak = useRef<null | (() => void)>(null)
  const interrupted = useRef(false)
  const revealedRef = useRef(0)

  const stageRef = useRef<JunoStage>('idle')
  const turnsRef = useRef<JunoTurn[]>([])
  const idRef = useRef(0)
  /** Bumped whenever the conversation is reset or ended, so anything still in flight from before knows to stand down. */
  const gen = useRef(0)
  const awaiting = useRef(false) // true while Juno is waiting for the advisor to answer
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
  // The advisor carrying on while Juno is still working out its reply
  const resumedMs = useRef(0)
  /** While the "Mm-hm" is playing its echo can reach the mic: it must not be mistaken for the advisor carrying on. */
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

  /** Juno's fixed lines in a language, from the server (cached). */
  const loadPhrases = useCallback(async (l: LangId): Promise<JunoPhrases> => {
    const hit = phrasesCache.current.get(l)
    if (hit) return hit
    const p = (await junoPhrases(l)) ?? (l === 'en' ? EN_PHRASES : phrasesCache.current.get('en') ?? EN_PHRASES)
    phrasesCache.current.set(l, p)
    return p
  }, [])
  useEffect(() => {
    let alive = true
    void loadPhrases(lang).then((p) => alive && setPhrases(p))
    return () => { alive = false }
  }, [lang, loadPhrases])

  /** Choose the language (before or during the conversation): Juno's next lines are in it. */
  const setLanguage = useCallback((l: LangId) => {
    langRef.current = l
    setLangState(l)
    void loadPhrases(l).then((p) => { phrasesRef.current = p; setPhrases(p) })
    voiceApi.current.sendLanguage(l)
  }, [loadPhrases])

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
    const key = `${langRef.current}|${voiceIdRef.current}|${tone}|${text}`
    let p = audioCache.current.get(key)
    if (!p) {
      p = junoSpeak(text, voiceIdRef.current, tone, langRef.current).then((b) => {
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
    const joinBelow = langRef.current === 'zh' ? 10 : 28 // characters: a very short sentence is joined to the next
    const re = /[^.!?。！？]+[.!?。！？]*\s*/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const t = m[0].trim()
      if (!t) continue
      const last = parts[parts.length - 1]
      if (last && last.text.length < joinBelow) last.text = `${last.text}${langRef.current === 'zh' ? '' : ' '}${t}`
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

  /** Get the "Mm-hm" clips ready before they are needed, so they play instantly. */
  const prewarm = useCallback(() => {
    if (!neuralRef.current) return
    phrasesRef.current.acks.forEach((t) => void audioFor(t, 'warm'))
  }, [audioFor])
  useEffect(() => {
    if (neural) prewarm()
  }, [neural, voiceId, phrases, prewarm])

  /** A very short spoken "Mm-hm" while Juno works out its reply — it is not part of the conversation record. */
  const acknowledge = useCallback(() => {
    if (silentRef.current) return
    const g = gen.current
    const acks = phrasesRef.current.acks
    const text = acks[ackIdx.current++ % acks.length]
    const done = () => {
      // The reply may already be speaking (and holding the mic closed): only reopen if nothing else is.
      if (g === gen.current && !busyTalking.current) voiceApi.current.setMicMuted(false)
    }
    if (neuralRef.current) {
      // Only a clip that is already in hand is used: an ack that arrives late is worse than none.
      const key = `${langRef.current}|${voiceIdRef.current}|warm|${text}`
      const pr = audioCache.current.get(key)
      if (!pr) return
      void Promise.race([pr, new Promise<null>((r) => window.setTimeout(() => r(null), 250))]).then((blob) => {
        if (!blob || g !== gen.current || busyTalking.current) return
        // The microphone stays open: an advisor who resumes speaking right now must not lose a single word.
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
    (text: string, tone = 'warm', open?: boolean | null, canBarge = false) =>
      new Promise<void>((resolve) => {
        const v = voiceApi.current
        const g = gen.current
        awaiting.current = false
        pending.current = ''
        // The model says whether its question invites a long answer; English text can also be judged by wording.
        openQuestion.current = open ?? (langRef.current === 'en' ? OPEN_QUESTION.test(text) : true)
        busyTalking.current = true
        bargeable.current = canBarge
        lineStartedAt.current = performance.now()
        echoSamples.current = []
        bargeStreak.current = 0
        revealedRef.current = 0
        v.setMicMuted(true)
        v.commitNow()
        v.sendAgentSay(text)
        addTurn('juno', text)
        setLine(text)
        setRevealed(0)
        setSpeaking(true)

        let finished = false
        const cps = CPS[langRef.current]
        const estimateMs = Math.max(1400, (text.length / cps) * 1000)
        const started = performance.now()
        let boundary = 0
        let audioReveal = 0
        const tick = window.setInterval(() => {
          const est = Math.floor(((performance.now() - started) / 1000) * cps)
          revealedRef.current = Math.min(text.length, Math.max(boundary, audioReveal, neuralRef.current ? 0 : est))
          setRevealed(revealedRef.current)
        }, 60)
        speakTimers.current.push(tick)

        // `cut`: the advisor interrupted — stop at once, keep the caption where it was, and the microphone is already open.
        const wrapUp = (cut: boolean) => {
          if (finished) return
          finished = true
          window.clearInterval(tick)
          busyTalking.current = false
          bargeable.current = false
          interruptSpeak.current = null
          if (g !== gen.current) return resolve() // the conversation was ended or reset meanwhile
          if (!cut) setRevealed(text.length)
          setSpeaking(false)
          if (cut) return resolve()
          // A beat after the last word, so the room's echo has died before the mic opens again.
          window.setTimeout(() => {
            if (g === gen.current) voiceApi.current.setMicMuted(false)
            resolve()
          }, 250)
        }
        const finish = () => wrapUp(false)
        interruptSpeak.current = () => {
          stopAudio()
          if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
          wrapUp(true)
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
    [addTurn, audioFor, sentences, stopAudio],
  )

  /** After Juno finishes speaking: listen for the advisor's answer, nudging once if it stays quiet. */
  const listen = useCallback(
    (canNudge = true) => {
      const g = gen.current
      if (interrupted.current) {
        // The advisor cut in: they are already talking, so do not reset what has been heard so far.
        interrupted.current = false
        awaiting.current = true
        return
      }
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
        await speak(phrasesRef.current.nudge)
        if (g === gen.current) listen(false) // one nudge per question, never a loop
      }, NUDGE_AFTER_MS)
    },
    [speak],
  )

  const finishSession = useCallback(async () => {
    setStageBoth('wrapup')
    awaiting.current = false
    voiceApi.current.setMicMuted(true)
    // Juno has read back and the advisor's last answer was committed long ago: nothing real is left in the buffer.
    voiceApi.current.stop(false) // the server finalises the profile and the last analysis; 'stopped' follows
  }, [setStageBoth])

  /** Says Juno's line and carries on: listens for the advisor's answer, or finishes after the read-back. */
  const deliver = useCallback(
    async (res: JunoTurnResponse, g: number, canBarge = !res.done) => {
      if (res.covered?.length) setCovered((c) => [...new Set([...c, ...res.covered])])
      if (res.readiness) setReadiness(res.readiness)
      await speak(res.say, res.tone, res.open, canBarge)
      if (g !== gen.current) return
      if (res.done) {
        setCovered(JUNO_TOPICS.map((t) => t.key))
        await finishSession()
      } else {
        listen()
      }
    },
    [finishSession, listen, speak],
  )

  /** The advisor has finished answering: ask the brain what Juno says next, then say it. */
  const respond = useCallback(
    async (answer: string) => {
      if (busy.current) return
      const g = gen.current
      busy.current = true
      awaiting.current = false
      if (nudgeTimer.current) window.clearTimeout(nudgeTimer.current)
      addTurn('advisor', answer)
      setThinking(true)
      resumedMs.current = 0
      late.current = ''
      const t0 = performance.now()
      // A short "Mm-hm" covers the moment Juno is working out its reply (only for a real answer).
      if (answer.split(/\s+/).length >= 4) acknowledge()
      try {
        const res = await junoDebriefTurn({
          profileId: voiceApi.current.profile?.id,
          dictation: dictationRef.current,
          turns: turnsRef.current.map(({ role, text }) => ({ role, text })),
          lang: langRef.current,
        })
        if (g !== gen.current) return
        // Hold a ready reply until the advisor has been quiet long enough: a pause mid-answer is not an ending.
        // With interruption on, a reply that comes a little early can simply be cut in on, so Juno responds sooner.
        const holdMs = (openQuestion.current ? HOLD_QUIET_OPEN_MS : HOLD_QUIET_MS) * (bargeRef.current ? 0.65 : 1)
        while (performance.now() - lastLoud.current < holdMs && performance.now() - t0 < HOLD_MAX_MS) {
          await new Promise((r) => window.setTimeout(r, 100))
          if (g !== gen.current) return
        }
        if (g !== gen.current) return
        // The advisor carried on speaking while Juno was working out its reply: that reply answers half an
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
        await deliver(res, g)
      } catch {
        if (g !== gen.current) return
        setThinking(false)
        await speak(phrasesRef.current.missed)
        if (g === gen.current) listen()
      } finally {
        busy.current = false
      }
    },
    [acknowledge, addTurn, deliver, listen, speak],
  )

  /**
   * The advisor has finished dictating and taps "Done, over to Juno": what was said is committed, Juno reads it,
   * says what it understood, and asks its first question about what is missing.
   */
  const handOver = useCallback(async () => {
    if (stageRef.current !== 'dictate' || busy.current) return
    const g = gen.current
    busy.current = true
    awaiting.current = false
    setThinking(true)
    setStageBoth('discovery')
    // Something to read while Juno thinks, so the first seconds never look idle.
    setLine('Reading your notes…')
    setRevealed(0)
    const v0 = voiceApi.current
    // The server gets ready for Juno's first line while the last words are still being transcribed.
    if (v0.profile?.id) junoDebriefPrepare(v0.profile.id, [...v0.finalSegments, v0.partialText].join(' ').replace(/\s+/g, ' ').trim())
    v0.commitNow()
    v0.sendConversational(true) // from here on the advisor gives short answers to Juno's questions
    // The last words are still on their way back as text: wait for them, but only as long as they take
    // (at least half a second, then until nothing new has arrived for a moment; never more than 1.8 s).
    const t0 = performance.now()
    let seen = voiceApi.current.finalSegments.length
    let changedAt = t0
    while (performance.now() - t0 < 1800) {
      await new Promise((r) => window.setTimeout(r, 100))
      if (g !== gen.current) return
      const cur = voiceApi.current
      if (cur.finalSegments.length !== seen || cur.partialText) {
        seen = cur.finalSegments.length
        changedAt = performance.now()
      }
      if (performance.now() - t0 >= 500 && performance.now() - changedAt >= 450 && !cur.partialText) break
    }
    const v = voiceApi.current
    // The spoken hand-over phrase ("Juno, over to you") is not part of the notes.
    dictationRef.current = [...v.finalSegments.filter((seg) => !HANDOVER_ALONE.test(seg)), v.partialText]
      .join(' ').replace(new RegExp(HANDOVER.source, 'gi'), ' ').replace(/\s+/g, ' ').trim()
    try {
      const res = await junoDebriefTurn({ profileId: v.profile?.id, dictation: dictationRef.current, turns: [], lang: langRef.current })
      if (g !== gen.current) return
      setThinking(false)
      // Juno's first line (what it understood) is the one the advisor most needs to hear whole: it is not interruptible.
      await deliver(res, g, false)
    } catch {
      if (g !== gen.current) return
      setThinking(false)
      await speak(phrasesRef.current.missed)
      if (g === gen.current) listen()
    } finally {
      busy.current = false
    }
  }, [deliver, listen, setStageBoth, speak])

  // Hands-free: saying "Juno, over to you" in the dictation does the same as the button.
  const { finalSegments: dictated } = voice
  useEffect(() => {
    if (stageRef.current !== 'dictate' || dictated.length === 0) return
    // The speech model often splits "Juno, over to you" into two lines ("Juno." / "Over to you."), so the last two are read together.
    if (HANDOVER.test(dictated.slice(-2).join(' ')) || dictated.slice(-3).some((seg) => HANDOVER_ALONE.test(seg))) void handOver()
  }, [dictated, handOver])

  // ── Interruption ──────────────────────────────────────────────────────────────────────────────────────────
  const percentile = (xs: number[], q: number) => {
    if (xs.length === 0) return 0
    const sorted = [...xs].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  }

  /** The advisor has started talking over Juno: stop mid-sentence and listen. */
  const barge = useCallback(() => {
    if (!busyTalking.current || !bargeable.current) return
    bargeable.current = false
    bargeStreak.current = 0
    echoSamples.current = []
    interrupted.current = true
    // What the advisor actually heard of the line, so the conversation record is honest about it.
    const lastJuno = [...turnsRef.current].reverse().find((t) => t.role === 'juno')
    if (lastJuno) {
      const heard = lastJuno.text.slice(0, Math.max(0, revealedRef.current)).trim()
      turnsRef.current = turnsRef.current.map((t) => (t.id === lastJuno.id ? { ...t, text: `${heard} … [interrupted]` } : t))
      setTurns(turnsRef.current)
    }
    interruptSpeak.current?.()
    voiceApi.current.releaseHeld(6) // the advisor's first words were held; send them, then listen normally
    const now = performance.now()
    awaiting.current = true
    pending.current = ''
    lastLoud.current = lastText.current = lastAmpAt.current = now
    loudMs.current = HEARD_MS
    committedAt.current = 0
    inFlight.current = false
    acked.current = false
  }, [])

  // While Juno speaks the microphone is still measured: a voice clearly above Juno's own echo, for about 0.3 s, is an interruption.
  useEffect(() => {
    voiceApi.current.setRawAmpListener((amp) => {
      if (!busyTalking.current || !bargeable.current || !bargeRef.current) {
        echoSamples.current = []
        bargeStreak.current = 0
        return
      }
      if (performance.now() - lineStartedAt.current < 900) {
        echoSamples.current.push(amp) // the first moments of the line show how loud Juno itself sounds in this room
        return
      }
      const base = percentile(echoSamples.current, 0.7)
      echoSamples.current.push(amp)
      if (echoSamples.current.length > 40) echoSamples.current.shift()
      bargeStreak.current = amp > Math.max(0.16, base * 1.8 + 0.08) ? bargeStreak.current + 1 : 0
      if (bargeStreak.current >= 3) barge()
    })
    return () => voiceApi.current.setRawAmpListener(null)
  }, [barge])

  const setBargeMode = useCallback((m: BargeMode) => {
    setBargeModeState(m)
    try { localStorage.setItem(BARGE_KEY, m) } catch { /* not remembering is fine */ }
  }, [])

  // Headphones make interruption safe: look at the audio output while the microphone is live.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return
    const check = async () => {
      try {
        const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput')
        const def = outs.find((d) => d.deviceId === 'default') ?? outs[0]
        setHeadset(HEADSET.test(def?.label ?? ''))
      } catch {
        setHeadset(false)
      }
    }
    void check()
    navigator.mediaDevices.addEventListener?.('devicechange', check)
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', check)
  }, [voice.status])

  // ── Watching the advisor ────────────────────────────────────────────────────────────────────────────────
  const { finalSegments, status, amplitude } = voice
  useEffect(() => {
    if (finalSegments.length < seenSegments.current) seenSegments.current = 0
    const fresh = finalSegments.slice(seenSegments.current)
    seenSegments.current = finalSegments.length
    // Only in the moments right after Juno's own "Mm-hm": otherwise a real "Okay." from the advisor is an answer.
    const echoWindow = performance.now() < ackUntil.current + 2500
    const isAck = (t: string) => ACK_ECHO.test(t.trim()) || phrasesRef.current.acks.some((a) => a.replace(/[\s.,!，。！]/g, '') === t.replace(/[\s.,!，。！]/g, ''))
    const realText = fresh.filter((t) => !(echoWindow && isAck(t)))
    if (realText.length && busy.current && !busyTalking.current) late.current = `${late.current} ${realText.join(' ')}`.trim()
    if (!awaiting.current || busy.current || realText.length === 0) return
    pending.current = `${pending.current} ${realText.join(' ')}`.trim()
    lastText.current = performance.now()
    inFlight.current = false // the committed speech has come back as text
  }, [finalSegments])

  // Microphone level: is the advisor speaking right now?
  useEffect(() => {
    if (busy.current && !busyTalking.current) {
      // Juno is thinking and the advisor is talking again.
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

  // The endpointing loop: commit when the advisor goes quiet, acknowledge, reply once the text has landed.
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
      const text = cleanAnswer(pending.current)
      if (!text || text.length < 2) {
        if (pending.current.trim() && now - lastText.current >= SETTLE_MS) pending.current = '' // nothing but greetings or fragments
        return
      }
      const textSettled = now - lastText.current >= SETTLE_MS
      if (NOT_AN_ANSWER.test(text)) {
        if (textSettled) pending.current = ''
        return
      }
      // Words with no voice behind them: the speech model sometimes invents a line from room noise ("Hello, my name is…").
      // A real answer always has the advisor's voice in it, so this is dropped instead of being answered.
      if (!heard && !inFlight.current && textSettled) {
        pending.current = ''
        return
      }
      const quiet = quietFor >= endpointMs(text, openQuestion.current, langRef.current) * (bargeRef.current ? 0.7 : 1)
      const stale = now - lastText.current >= MAX_WAIT_MS && quietFor >= COMMIT_QUIET_MS
      if ((quiet && textSettled && !inFlight.current) || stale) void respond(text)
    }, 100)
    return () => window.clearInterval(id)
  }, [respond])

  // Juno opens the conversation as soon as the microphone is live.
  useEffect(() => {
    // Juno opens by listening: the advisor dictates freely, and Juno only speaks once they hand over.
    if (stageRef.current === 'connecting' && status === 'listening') {
      setStageBoth('dictate')
      startedAt.current = Date.now()
      setElapsedMs(null)
      if (langRef.current !== 'en') voiceApi.current.sendLanguage(langRef.current)
    }
    if (status === 'stopped' && (stageRef.current === 'wrapup' || stageRef.current === 'discovery' || stageRef.current === 'dictate')) {
      setStageBoth('finished')
      if (startedAt.current) setElapsedMs(Date.now() - startedAt.current)
    }
    if (status === 'error' && stageRef.current !== 'idle') setStageBoth('error')
  }, [status, setStageBoth])

  /** Clears the conversation but keeps the chosen language (used when a conversation starts). */
  const resetState = useCallback(() => {
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
    dictationRef.current = ''
    startedAt.current = 0
    setElapsedMs(null)
    setReadiness(null)
    setStageBoth('idle')
  }, [clearTimers, setStageBoth, stopAudio])

  /** Back to the start for a new advisor: English again. */
  const reset = useCallback(() => {
    resetState()
    langRef.current = 'en'
    setLangState('en')
  }, [resetState])

  const start = useCallback(async () => {
    resetState()
    phrasesRef.current = await loadPhrases(langRef.current)
    prewarm()
    noiseFloor.current = 0.03 // a fresh conversation starts with a fresh idea of the room
    setStageBoth('connecting')
    // Speech synthesis needs a user gesture: speaking an empty phrase now unlocks it for later.
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.speak(new SpeechSynthesisUtterance(''))
    await voiceApi.current.start('juno-debrief')
  }, [resetState, loadPhrases, prewarm, setStageBoth])

  /** End now: Juno stops talking and listening immediately; what was said so far is kept for the advisor to review. */
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
    if (stageRef.current === 'connecting') {
      // Nothing has been said yet.
      voiceApi.current.reset()
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

  const listening = !speaking && !thinking && (stage === 'dictate' || stage === 'discovery')
  const progress = useMemo(() => covered.filter((c) => JUNO_TOPICS.some((t) => t.key === c)).length, [covered])

  return {
    stage, turns, speaking, thinking, listening, covered, line, revealed, progress,
    silent, toggleSilent, voiceChoices, voiceId, chooseVoice,
    lang, setLanguage, phrases,
    bargeMode, setBargeMode, bargeEnabled, headset,
    start, end, reset, handOver, elapsedMs, readiness,
  }
}

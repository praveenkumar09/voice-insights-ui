import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { getReading, junoCommand, type JunoActionSpec, type ReadDoc, type Reading } from '../../../api/client'
import { useVoiceCapture } from '../../../hooks/useVoiceCapture'
import { parseReadControl, parseWake, parseYesNo, stripWake, type ReadControl } from '../../../utils/junoWords'
import { createPlayer, headphonesConnected, splitSentences, type Player } from '../../../utils/readAloud'
import { chime, prewarmSpeech, speakAndWait, stopSpeaking } from '../../../utils/speak'
import { matchLocal, vocabularyFor } from '../../../utils/junoLocal'
import { recentFirstNames } from '../../../utils/recentCustomers'
import { isEcho } from '../../../utils/echo'
import { pageButtonActions } from '../../../utils/pageButtons'
import { voiceLock } from '../../../utils/voiceLock'

/**
 * Spark mode: say "Hey Spark" and Spark handles what you ask on the current screen, like Siri. It keeps one listen-only speech session
 * open (the same Azure speech service as everywhere else; nothing is saved), looks for the wake words in what is heard, works out which
 * action on screen was asked for, and does it. Opening or reading something just happens, with Spark saying so. Anything that changes
 * data is asked about first ("Copy the message?") and waits for a yes. Spark never presses Approve or sends anything: it points at the
 * button and says so. The mode steps aside whenever a debrief, rehearsal or Ask conversation needs the microphone, and switches itself
 * off after a quiet quarter of an hour.
 */
export type JunoPhase = 'off' | 'consent' | 'starting' | 'listening' | 'awake' | 'thinking' | 'speaking' | 'confirming' | 'paused' | 'reading'

/** One thing Spark can do on a screen. Screens register theirs while they are showing, so the list is always what is possible right now. */
export interface JunoAction extends JunoActionSpec {
  /** Does it. May return a sentence for Spark to say afterwards (a result, or why it could not). */
  run: (params: Record<string, string>) => Promise<string | void> | string | void
}

/** What Spark is reading aloud right now. */
export interface ReadingState {
  title: string
  heading: string
  /** 0-based section being read, and how many there are. */
  index: number
  total: number
  paused: boolean
  doc: ReadDoc
}

interface Ctx {
  enabled: boolean
  /** Set while Spark reads a briefing, the report or part of the advice pack aloud (works with Spark mode off too). */
  reading: ReadingState | null
  /** Starts reading. Rejects with a plain message if there is nothing to read. */
  read: (runId: string, doc: ReadDoc, name?: string) => Promise<void>
  /** Starts reading a briefing that has already been fetched (for example a customer's brief from memory). */
  readLoaded: (data: Reading) => Promise<void>
  /** Spark asks a question aloud and returns what the advisor says next (null if nothing is said in time). Spark mode must be on. */
  ask: (question: string, options?: string[]) => Promise<string | null>
  /** While Spark asks which of several: the options, shown as buttons in the capsule (null otherwise). */
  choices: string[] | null
  /** Taps option i (0-based), or -1 for "neither". */
  choose: (i: number) => void
  readControl: (c: ReadControl) => void
  phase: JunoPhase
  /** What the advisor is saying right now (before it is final). */
  caption: string
  /** The line Spark is saying or showing. */
  message: string
  amplitude: number
  /** Why the mode switched itself off, or a one-line state worth showing. */
  notice: string | null
  toggle: () => void
  acceptConsent: () => void
  declineConsent: () => void
  /** The Yes / No buttons on a confirmation (the advisor can also just say it). */
  answer: (yes: boolean) => void
  /** What can be said on this screen, in plain words. */
  examples: () => string[]
  /** Spark says something unprompted (the suggestion is ready), only if it is idle and listening: never over a reading or a conversation. */
  announce: (text: string) => void
  register: (id: string, get: () => JunoAction | null) => () => void
  registerScreen: (key: string, label: string) => () => void
}

const JunoModeContext = createContext<Ctx | null>(null)

export function useJunoMode(): Ctx {
  const c = useContext(JunoModeContext)
  if (!c) throw new Error('useJunoMode needs a JunoModeProvider')
  return c
}

/** Offer one action to Spark while the calling component is mounted. Pass null while it is not possible. */
export function useJunoAction(action: JunoAction | null) {
  const ctx = useContext(JunoModeContext)
  const ref = useRef(action)
  ref.current = action
  const id = action?.id
  useEffect(() => {
    if (!ctx || !id) return
    return ctx.register(id, () => ref.current)
  }, [ctx, id])
}

/** Say something unprompted through Spark mode, if it is on and idle. A no-op otherwise (and outside the provider). */
export function useJunoAnnounce(): (text: string) => void {
  const ctx = useContext(JunoModeContext)
  return ctx ? ctx.announce : () => {}
}

/** Tell Spark where the advisor is ("the debrief review, Summary tab"), so a request can be read in context. */
export function useJunoScreen(label: string | null) {
  const ctx = useContext(JunoModeContext)
  const key = useId()
  useEffect(() => {
    if (!ctx || !label) return
    return ctx.registerScreen(key, label)
  }, [ctx, key, label])
}

const CONSENT_KEY = 'vi_juno_mode_ok'
const IDLE_OFF_MS = 15 * 60 * 1000
const RECYCLE_MS = 12 * 60 * 1000
const AWAKE_WAIT_MS = 9000
const CONFIRM_WAIT_MS = 10000
/** Choosing between people takes longer than a yes or no. */
const CHOICE_WAIT_MS = 15000
const UNMUTE_DELAY_MS = 250
/** After a bare "Hey Spark" while reading, the next line is taken as the command for this long. */
const ARMED_MS = 6000
/** How long the reading stays paused after the advisor starts speaking over it, before it carries on by itself. */
const DUCK_MS = 4500
/** Exactly these phrases stop a reading without the wake word. */
const BARE_STOP = /^[\s,.!-]*(?:please )?(?:stop(?: (?:reading|it|that|talking))?|that'?s enough|enough|be quiet)[\s,.!?-]*$/i
/** An action's result that only confirms what the screen already shows ("Switched to …"): shown, not spoken. */
const CONFIRMATION = /^(switched|opened|opening|showing|showed|done|ok|okay|ready|starting|going|logging|turning)\b/i

export function JunoModeProvider({ children, customerName }: { children: ReactNode; customerName?: string | null }) {
  const capture = useVoiceCapture({ assistant: true })
  const [enabled, setEnabled] = useState(false)
  const [phase, setPhaseState] = useState<JunoPhase>('off')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const enabledRef = useRef(false)
  const phaseRef = useRef<JunoPhase>('off')
  const setPhase = useCallback((p: JunoPhase) => { phaseRef.current = p; setPhaseState(p) }, [])
  const registry = useRef(new Map<string, () => JunoAction | null>())
  const screens = useRef(new Map<string, string>())
  const customer = useRef<string | null>(customerName ?? null)
  customer.current = customerName ?? null

  const finalsRef = useRef<string[]>([])
  finalsRef.current = capture.finalSegments
  const consumed = useRef(0)
  const busy = useRef(false)
  const waiter = useRef<((text: string | null) => void) | null>(null)
  const waitTimer = useRef<number | null>(null)
  const lastActivity = useRef(Date.now())
  const restarts = useRef<number[]>([])
  const noticeTimer = useRef<number | null>(null)
  const askedConsent = useRef(false)

  // reading aloud
  const [reading, setReadingState] = useState<ReadingState | null>(null)
  const [choices, setChoices] = useState<string[] | null>(null)
  const tapResolve = useRef<((v: string) => void) | null>(null)
  const readingRef = useRef<ReadingState | null>(null)
  const setReading = useCallback((r: ReadingState | null) => { readingRef.current = r; setReadingState(r) }, [])
  const readJob = useRef<{ player: Player | null; jump: number | null; stopped: boolean } | null>(null)
  const sayPromise = useRef<Promise<void> | null>(null)
  const readMicOpen = useRef(false)
  const readCommit = useRef<number | null>(null)
  const armedUntil = useRef(0)
  const duckTimer = useRef<number | null>(null)
  /** What Spark itself said or is reading lately: a line that merely repeats it is the speaker leaking into the microphone, not the advisor. */
  const spokenRecently = useRef<string[]>([])
  const readingText = useRef<string[]>([])

  const flash = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000)
  }, [])

  // ── the registry ──
  const register = useCallback((id: string, get: () => JunoAction | null) => {
    registry.current.set(id, get)
    return () => { if (registry.current.get(id) === get) registry.current.delete(id) }
  }, [])
  const registerScreen = useCallback((key: string, label: string) => {
    screens.current.set(key, label)
    return () => { screens.current.delete(key) }
  }, [])
  // What each screen registered, plus every button that is actually on it (see utils/pageButtons).
  const available = (): JunoAction[] => [...([...registry.current.values()].map((g) => g()).filter(Boolean) as JunoAction[]), ...pageButtonActions()]
  const examples = useCallback(() => available().filter((a) => a.id !== 'turn_off_juno_mode').slice(0, 8).map((a) => a.description), []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── speaking and listening, one at a time ──
  /** Spark speaks; the microphone is closed meanwhile, so it never hears itself, and reopened afterwards. */
  const say = useCallback((text: string) => {
    const p = (async () => {
      // Another voice feature took the microphone meanwhile (e.g. Spark pressed "Start debrief"): stay paused, say nothing.
      if (phaseRef.current === 'paused' || voiceLock.busy()) return
      setMessage(text)
      spokenRecently.current = [text, ...spokenRecently.current].slice(0, 3)
      setPhase('speaking')
      capture.setMicMuted(true)
      await speakAndWait(text)
      if ((phaseRef.current as JunoPhase) === 'paused') return
      capture.turnTaken()
      await new Promise((r) => window.setTimeout(r, UNMUTE_DELAY_MS))
      consumed.current = finalsRef.current.length
      capture.setMicMuted(false)
    })()
    sayPromise.current = p
    return p
  }, [capture, setPhase])

  /** The next thing the advisor says (up to {@code ms}), or null if they say nothing. */
  const nextUtterance = useCallback((ms: number) => new Promise<string | null>((resolve) => {
    waiter.current = resolve
    waitTimer.current = window.setTimeout(() => { waiter.current = null; resolve(null) }, ms)
  }), [])
  const deliver = (text: string): boolean => {
    const w = waiter.current
    if (!w) return false
    waiter.current = null
    if (waitTimer.current) window.clearTimeout(waitTimer.current)
    w(text)
    return true
  }

  const backToListening = useCallback(() => {
    busy.current = false
    lastActivity.current = Date.now()
    setMessage('')
    if (readingRef.current) return // a reading is under way: it keeps the stage
    // A command that opened a voice feature (it now holds the microphone) leaves Spark paused, not listening.
    if (enabledRef.current && voiceLock.busy()) { setPhase('paused'); return }
    if (enabledRef.current && phaseRef.current !== 'paused') setPhase('listening')
  }, [setPhase])

  /** Spark speaks up on its own, but only when idle and listening, so it never talks over a reading, a command or another voice feature. */
  const announce = useCallback((text: string) => {
    if (!enabledRef.current || busy.current || readingRef.current || phaseRef.current !== 'listening' || voiceLock.busy()) return
    busy.current = true
    lastActivity.current = Date.now()
    void say(text).finally(() => backToListening())
  }, [say, backToListening])

  // ── reading aloud ──
  const endReading = useCallback(() => {
    const job = readJob.current
    if (job) { job.stopped = true; job.player?.stop() }
    readJob.current = null
    readingText.current = []
    if (readCommit.current) { window.clearInterval(readCommit.current); readCommit.current = null }
    if (duckTimer.current) { window.clearTimeout(duckTimer.current); duckTimer.current = null }
    capture.setRawAmpListener(null)
    setReading(null)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null
      for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'stop'] as MediaSessionAction[]) {
        try { navigator.mediaSession.setActionHandler(a, null) } catch { /* not supported */ }
      }
    }
    busy.current = false
    lastActivity.current = Date.now()
    if (enabledRef.current && phaseRef.current !== 'paused' && phaseRef.current !== 'off') {
      capture.setMicMuted(false)
      setPhase('listening')
    }
  }, [capture, setPhase, setReading])

  const readControl = useCallback((c: ReadControl) => {
    const job = readJob.current
    const cur = readingRef.current
    if (!job || !cur) return
    lastActivity.current = Date.now()
    if (c === 'pause') { job.player?.pause(); setReading({ ...cur, paused: true }) }
    else if (c === 'resume') { job.player?.resume(); setReading({ ...cur, paused: false }) }
    else if (c === 'stop') endReading()
    else {
      job.jump = c === 'next' ? cur.index + 1 : c === 'previous' ? Math.max(0, cur.index - 1) : cur.index
      if (cur.paused) setReading({ ...cur, paused: false })
      job.player?.stop()
    }
  }, [endReading, setReading])

  const startReading = useCallback(async (data: Reading, doc: ReadDoc, name?: string) => {
    if (readJob.current) endReading()
    stopSpeaking()
    const sections = data.sections.filter((x) => x.text.trim())
    if (sections.length === 0) throw new Error('There is nothing to read for that yet.')
    const job = { player: null as Player | null, jump: null as number | null, stopped: false }
    readJob.current = job
    readingText.current = sections.map((x) => x.text)
    busy.current = false
    lastActivity.current = Date.now()
    const title = name && !data.title.includes(name) ? `${data.title}, ${name}` : data.title
    setReading({ title, heading: sections[0].heading, index: 0, total: sections.length, paused: false, doc })

    const playing = (idx: number, paused = false) => setReading({ title, heading: sections[idx].heading, index: idx, total: sections.length, paused, doc })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: data.title, artist: 'Spark', album: name ?? 'AIA Spark' })
      const set = (a: MediaSessionAction, h: () => void) => { try { navigator.mediaSession.setActionHandler(a, h) } catch { /* not supported */ } }
      set('play', () => readControl('resume'))
      set('pause', () => readControl('pause'))
      set('nexttrack', () => readControl('next'))
      set('previoustrack', () => readControl('previous'))
      set('stop', () => readControl('stop'))
    }

    void (async () => {
      // let the announcement ("Briefing you on…") finish first
      try { await sayPromise.current } catch { /* announcement failed: carry on */ }
      if (job.stopped) return
      const phones = enabledRef.current ? await headphonesConnected() : false
      readMicOpen.current = phones
      if (enabledRef.current) {
        setPhase('reading')
        capture.setMicMuted(false)
        // Spark's voice fills the room while it reads, so the server never finds a pause to end an utterance on: cutting the audio every
        // 1.5 s means a spoken "stop" is heard within a couple of seconds.
        if (readCommit.current) window.clearInterval(readCommit.current)
        readCommit.current = window.setInterval(() => capture.commitNow(), 1500)
        // Duck on speech, as a voice assistant does: Spark's voice leaks into the mic whatever the echo cancellation, and the speech model cannot
        // pick "Hey Spark, stop reading" out of a mix. So when the mic level rises well above Spark's own leakage for a third of a second, the
        // reading pauses at once and the mic hears only the advisor. A control stops or moves it; anything else, it carries on after a moment.
        let base = 0
        let run = 0
        let ducked = 0
        capture.setRawAmpListener((amp) => {
          if (job.stopped || readJob.current !== job || Date.now() < ducked) return
          if (base === 0) base = amp
          if (amp > Math.max(base * 1.5, base + 0.05)) run++
          else { run = 0; base += (amp - base) * 0.1 }
          if (run >= 3) {
            run = 0
            ducked = Date.now() + DUCK_MS
            job.player?.pause()
            if (duckTimer.current) window.clearTimeout(duckTimer.current)
            duckTimer.current = window.setTimeout(() => {
              base = 0
              if (readJob.current === job && !readingRef.current?.paused) job.player?.resume()
            }, DUCK_MS)
          }
        })
      }
      let i = 0
      while (i < sections.length && !job.stopped) {
        playing(i)
        const sec = sections[i]
        const sentences = splitSentences(sec.heading && sections.length > 1 ? `${sec.heading}. ${sec.text}` : sec.text)
        job.jump = null
        job.player = createPlayer(sentences)
        const outcome = await job.player.done
        if (job.stopped) return
        if (job.jump !== null) { i = Math.min(job.jump, sections.length - 1); if (job.jump >= sections.length) break; continue }
        if (outcome === 'stopped') return
        i++
        if (job.jump !== null) { i = job.jump; job.jump = null }
      }
      if (!job.stopped) endReading()
    })()
  }, [capture, endReading, readControl, setPhase, setReading])

  const read = useCallback(async (runId: string, doc: ReadDoc, name?: string) => {
    if (readJob.current) endReading()
    stopSpeaking()
    await startReading(await getReading(runId, doc), doc, name)
  }, [endReading, startReading])

  const readLoaded = useCallback((data: Reading) => startReading(data, 'brief'), [startReading])

  // ── handling a request ──
  const handleCommand = useCallback(async (utterance: string) => {
    const wasReading = !!readingRef.current
    busy.current = true
    lastActivity.current = Date.now()
    setPhase('thinking')
    setMessage('')
    try {
      const actions = available()
      const own: JunoAction = {
        id: 'turn_off_juno_mode', description: 'Turn Spark mode off', risk: 'open',
        run: () => { window.setTimeout(() => turnOff(), 900); return 'Okay, I’ll stop listening.' },
      }
      const all = [...actions, own]
      const screen = [...screens.current.values()].join('; ') || 'the app'
      const specs = all.map(({ id, description, risk, params }) => ({ id, description, risk, params }))
      // A plain request that is clearly one listed action needs no language model (that round trip is most of the wait).
      const local = matchLocal(utterance, specs)
      const r = local
        ? { action: local.action.id, params: local.params, say: '', ask: '' }
        : await junoCommand(utterance, screen, customer.current, specs)
      const action = all.find((a) => a.id === r.action)

      // Hands-free reading is read-only: nothing that changes data happens while the advisor may be driving.
      if (wasReading && action?.risk === 'change') {
        readControl('pause')
        await say('I’ll do that when you’re parked. For now I only read and open things.')
        busy.current = false
        readControl('resume')
        if (enabledRef.current) { setPhase('reading'); capture.setMicMuted(false) }
        return
      }
      if (wasReading) endReading()
      if (!action) return void (await say(r.say))

      if (action.risk === 'change') {
        // Changes data: ask first, and only a clear yes goes ahead.
        await say(r.ask || `${r.say.replace(/[.!]+$/, '')}?`)
        setPhase('confirming')
        capture.sendConfirming(true)
        const heard = await nextUtterance(CONFIRM_WAIT_MS).finally(() => capture.sendConfirming(false))
        const verdict = heard ? parseYesNo(heard) : null
        if (verdict !== 'yes') return void (await say(verdict === 'no' ? 'Okay, I won’t.' : 'I didn’t hear a yes, so I haven’t done anything.'))
        const done = await action.run(r.params)
        chime('done')
        return void (await say(typeof done === 'string' && done ? done : 'Done.'))
      }

      // Opening, pointing, reading: do it at once. A chime says "heard you" with no wait for a spoken reply; Spark speaks only when
      // there is something to hear (a reading, a problem), not to repeat what the screen now shows.
      chime('done')
      let result: string | void
      try {
        result = await action.run(r.params)
      } catch (e) {
        result = e instanceof Error ? e.message : 'That didn’t work.'
      }
      if (typeof result === 'string' && result) {
        if (action.risk !== 'info' && CONFIRMATION.test(result)) flash(result)
        else await say(result)
      }
    } catch (e) {
      await say(e instanceof Error && /429|many/.test(e.message) ? 'That’s a lot of requests. Give me a few minutes.' : 'Sorry, I couldn’t work that out. Try again.')
    } finally {
      backToListening()
    }
  }, [backToListening, capture, endReading, nextUtterance, readControl, say, setPhase]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Spark asks a question and listens for the answer, like the yes/no before a change. Used when a request needs one more thing ("which Nick?"). */
  const ask = useCallback(async (question: string, options?: string[]): Promise<string | null> => {
    // A tap on one of the options (shown from the start) can answer while Spark is still talking, and cuts it short.
    const tap = new Promise<string>((resolve) => { tapResolve.current = resolve })
    setChoices(options && options.length > 0 ? options : null)
    try {
      const first = await Promise.race([say(question).then(() => null), tap])
      if (first !== null) { console.debug('[juno] ask: tapped while speaking', first); stopSpeaking(); capture.setMicMuted(false); return first }
      setPhase('confirming')
      capture.sendConfirming(true)
      const heard = await Promise.race([nextUtterance(options ? CHOICE_WAIT_MS : CONFIRM_WAIT_MS), tap])
      if (waiter.current) { waiter.current = null; if (waitTimer.current) window.clearTimeout(waitTimer.current) } // a tap won: nobody is waiting for speech any more
      console.debug('[juno] ask: answer', JSON.stringify(heard))
      return heard
    } finally {
      tapResolve.current = null
      capture.sendConfirming(false)
      setChoices(null)
      // Answered (or timed out): do not leave the question and its buttons on screen while the next thing loads.
      if (phaseRef.current === 'confirming' || phaseRef.current === 'speaking') { setMessage(''); setPhase('thinking') }
    }
  }, [capture, nextUtterance, say, setPhase])

  /** Heard its name with nothing after it: a soft chime, then the next thing said is the request. */
  const awaken = useCallback(async () => {
    busy.current = true
    lastActivity.current = Date.now()
    setPhase('awake')
    setMessage('')
    chime('wake')
    const heard = await nextUtterance(AWAKE_WAIT_MS)
    if (!heard) {
      backToListening()
      return
    }
    await handleCommand(stripWake(heard))
  }, [backToListening, handleCommand, nextUtterance, setPhase])

  // What the speech service has finished transcribing.
  useEffect(() => {
    const finals = capture.finalSegments
    if (finals.length < consumed.current) consumed.current = 0 // a new session started
    while (consumed.current < finals.length) {
      const text = finals[consumed.current++]
      console.debug('[juno] heard', JSON.stringify(text), 'phase', phaseRef.current, readingRef.current ? '(reading)' : '')
      if (!enabledRef.current || phaseRef.current === 'speaking' || phaseRef.current === 'paused') continue
      if (isEcho(text, [...spokenRecently.current, ...readingText.current])) { console.debug('[juno] ignored its own voice', JSON.stringify(text)); continue }
      if (deliver(text)) continue
      if (busy.current) continue
      if (readingRef.current) {
        // While reading, a short plain command ("pause", "next") is enough; anything else needs the name.
        const wakeR = parseWake(text)
        const restLen = wakeR ? wakeR.rest.replace(/[^\p{L}\p{N}]/gu, '').length : 0
        // The audio is cut every 1.5 s while reading, so "Hey Spark," and "stop reading" can arrive as two lines: a bare wake word arms the next
        // few seconds for a control. A plain "stop" needs no wake word (the mic is echo-cancelled, and only these exact phrases count).
        if (wakeR && restLen < 3) {
          armedUntil.current = Date.now() + ARMED_MS
          // Its name is the signal that a command follows: hold the reading at once so the command ("stop", "next") is heard in a quiet
          // room, not over Spark's own voice. If nothing follows, the reading carries on by itself.
          const job = readJob.current
          if (job && !readingRef.current?.paused) {
            job.player?.pause()
            if (duckTimer.current) window.clearTimeout(duckTimer.current)
            duckTimer.current = window.setTimeout(() => {
              if (readJob.current === job && !readingRef.current?.paused) job.player?.resume()
            }, ARMED_MS)
          }
        }
        const armed = Date.now() < armedUntil.current
        const bareStop = BARE_STOP.test(text)
        const ctl = parseReadControl(wakeR ? wakeR.rest : readMicOpen.current || armed || bareStop ? text : '')
        if (ctl) { armedUntil.current = 0; readControl(ctl) }
        else if (wakeR && restLen >= 3) void handleCommand(wakeR.rest)
        continue
      }
      const wake = parseWake(text)
      if (!wake) continue
      // "Stop reading" with nothing being read (the tail of a stop already obeyed, or a late repeat) needs no answer.
      if (BARE_STOP.test(wake.rest)) continue
      lastActivity.current = Date.now()
      if (wake.rest.replace(/[^\p{L}\p{N}]/gu, '').length >= 3) void handleCommand(wake.rest)
      else void awaken()
    }
  }, [capture.finalSegments, awaken, handleCommand, readControl])

  // Tell the speech service what can be said on this screen (it then picks the nearest real command instead of inventing words), and
  // have the lines Spark says most already fetched.
  useEffect(() => {
    if (!enabled) return
    prewarmSpeech(['Done.'])
    let last = ''
    const sync = () => {
      const phrases = vocabularyFor(available(), recentFirstNames())
      const key = phrases.join('|')
      if (key === last) return
      last = key
      capture.sendCommands(phrases)
    }
    sync()
    const t = window.setInterval(sync, 1500)
    return () => window.clearInterval(t)
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── the listening session ──
  const startListening = useCallback(() => {
    if (!enabledRef.current) return
    consumed.current = 0
    setPhase('starting')
    void capture.start('ask')
  }, [capture, setPhase])

  const turnOff = useCallback((why?: string) => {
    enabledRef.current = false
    setEnabled(false)
    busy.current = false
    waiter.current?.(null)
    waiter.current = null
    if (waitTimer.current) window.clearTimeout(waitTimer.current)
    if (readJob.current) endReading()
    stopSpeaking()
    capture.reset()
    setMessage('')
    setPhase('off')
    if (why) flash(why)
  }, [capture, endReading, flash, setPhase])

  const begin = useCallback(() => {
    enabledRef.current = true
    setEnabled(true)
    setNotice(null)
    lastActivity.current = Date.now()
    if (voiceLock.busy()) {
      setPhase('paused')
      return
    }
    startListening()
  }, [setPhase, startListening])

  const toggle = useCallback(() => {
    if (enabledRef.current || phaseRef.current === 'consent') return turnOff()
    let ok = false
    try { ok = localStorage.getItem(CONSENT_KEY) === '1' } catch { /* asked every time */ }
    if (!ok && !askedConsent.current) {
      setPhase('consent')
      return
    }
    begin()
  }, [begin, setPhase, turnOff])

  const acceptConsent = useCallback(() => {
    askedConsent.current = true
    try { localStorage.setItem(CONSENT_KEY, '1') } catch { /* asked next time */ }
    begin()
  }, [begin])
  const declineConsent = useCallback(() => setPhase('off'), [setPhase])

  const answer = useCallback((yes: boolean) => { deliver(yes ? 'yes' : 'no') }, [])
  const choose = useCallback((i: number) => {
    const v = i < 0 ? 'neither' : String(i + 1)
    if (waiter.current) deliver(v)
    else tapResolve.current?.(v)
  }, [])

  // The session opened (or fell over).
  useEffect(() => {
    if (!enabledRef.current) return
    if (capture.status === 'listening' && phaseRef.current === 'starting') {
      setPhase('listening')
    } else if ((capture.status === 'error' || capture.status === 'stopped') && phaseRef.current !== 'paused' && phaseRef.current !== 'off') {
      // The connection dropped: try again, but not in a loop.
      const now = Date.now()
      restarts.current = [...restarts.current.filter((t) => now - t < 60000), now]
      if (restarts.current.length > 4) return turnOff('Spark mode turned off: the microphone connection keeps dropping.')
      window.setTimeout(() => { if (enabledRef.current && !busy.current && phaseRef.current !== 'paused') { capture.reset(); startListening() } }, 1500)
    }
  }, [capture.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Another voice feature needs the microphone: step aside, then come back.
  useEffect(() => voiceLock.subscribe((other) => {
    if (!enabledRef.current) return
    if (other && phaseRef.current !== 'paused') {
      if (readJob.current) endReading()
      waiter.current?.(null)
      waiter.current = null
      stopSpeaking()
      capture.reset()
      busy.current = false
      setMessage('')
      setPhase('paused')
    } else if (!other && phaseRef.current === 'paused') {
      window.setTimeout(() => { if (enabledRef.current && !voiceLock.busy() && phaseRef.current === 'paused') startListening() }, 600)
    }
  }), [capture, endReading, setPhase, startListening])

  // Quiet for a quarter of an hour: switch off. Every 12 minutes of listening the session is renewed, so it never goes stale.
  useEffect(() => {
    if (!enabled) return
    const t = window.setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_OFF_MS) turnOff('Spark mode turned itself off after 15 quiet minutes.')
    }, 30000)
    const r = window.setInterval(() => {
      if (enabledRef.current && phaseRef.current === 'listening' && !busy.current) { capture.reset(); startListening() }
    }, RECYCLE_MS)
    return () => { window.clearInterval(t); window.clearInterval(r) }
  }, [enabled, capture, startListening, turnOff])

  // Escape stops whatever Spark is doing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !enabledRef.current) return
      if (readingRef.current) return endReading()
      stopSpeaking()
      waiter.current?.(null)
      waiter.current = null
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [endReading])

  // Leaving the app closes the microphone.
  useEffect(() => () => { readJob.current && (readJob.current.stopped = true, readJob.current.player?.stop()); capture.reset(); stopSpeaking() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Ctx>(() => ({
    enabled, reading, read, readLoaded, ask, choices, choose, readControl, phase, caption: capture.partialText, message, amplitude: capture.amplitude, notice,
    toggle, acceptConsent, declineConsent, answer, examples, announce, register, registerScreen,
  }), [enabled, reading, read, readLoaded, ask, choices, choose, readControl, phase, capture.partialText, capture.amplitude, message, notice, toggle, acceptConsent, declineConsent, answer, examples, announce, register, registerScreen])

  return <JunoModeContext.Provider value={value}>{children}</JunoModeContext.Provider>
}

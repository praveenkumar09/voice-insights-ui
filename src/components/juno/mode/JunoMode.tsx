import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { getReading, junoCommand, type JunoActionSpec, type ReadDoc } from '../../../api/client'
import { useVoiceCapture } from '../../../hooks/useVoiceCapture'
import { parseReadControl, parseWake, parseYesNo, stripWake, type ReadControl } from '../../../utils/junoWords'
import { createPlayer, headphonesConnected, splitSentences, type Player } from '../../../utils/readAloud'
import { chime, speakAndWait, stopSpeaking } from '../../../utils/speak'
import { voiceLock } from '../../../utils/voiceLock'

/**
 * Juno mode: say "Hey Juno" and Juno handles what you ask on the current screen, like Siri. It keeps one listen-only speech session
 * open (the same Azure speech service as everywhere else; nothing is saved), looks for the wake words in what is heard, works out which
 * action on screen was asked for, and does it. Opening or reading something just happens, with Juno saying so. Anything that changes
 * data is asked about first ("Copy the message?") and waits for a yes. Juno never presses Approve or sends anything: it points at the
 * button and says so. The mode steps aside whenever a debrief, rehearsal or Ask conversation needs the microphone, and switches itself
 * off after a quiet quarter of an hour.
 */
export type JunoPhase = 'off' | 'consent' | 'starting' | 'listening' | 'awake' | 'thinking' | 'speaking' | 'confirming' | 'paused' | 'reading'

/** One thing Juno can do on a screen. Screens register theirs while they are showing, so the list is always what is possible right now. */
export interface JunoAction extends JunoActionSpec {
  /** Does it. May return a sentence for Juno to say afterwards (a result, or why it could not). */
  run: (params: Record<string, string>) => Promise<string | void> | string | void
}

/** What Juno is reading aloud right now. */
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
  /** Set while Juno reads a briefing, the report or part of the advice pack aloud (works with Juno mode off too). */
  reading: ReadingState | null
  /** Starts reading. Rejects with a plain message if there is nothing to read. */
  read: (runId: string, doc: ReadDoc, name?: string) => Promise<void>
  readControl: (c: ReadControl) => void
  phase: JunoPhase
  /** What the advisor is saying right now (before it is final). */
  caption: string
  /** The line Juno is saying or showing. */
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
  register: (id: string, get: () => JunoAction | null) => () => void
  registerScreen: (key: string, label: string) => () => void
}

const JunoModeContext = createContext<Ctx | null>(null)

export function useJunoMode(): Ctx {
  const c = useContext(JunoModeContext)
  if (!c) throw new Error('useJunoMode needs a JunoModeProvider')
  return c
}

/** Offer one action to Juno while the calling component is mounted. Pass null while it is not possible. */
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

/** Tell Juno where the advisor is ("the debrief review, Summary tab"), so a request can be read in context. */
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
const UNMUTE_DELAY_MS = 250

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
  const readingRef = useRef<ReadingState | null>(null)
  const setReading = useCallback((r: ReadingState | null) => { readingRef.current = r; setReadingState(r) }, [])
  const readJob = useRef<{ player: Player | null; jump: number | null; stopped: boolean } | null>(null)
  const sayPromise = useRef<Promise<void> | null>(null)
  const readMicOpen = useRef(false)

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
  const available = (): JunoAction[] => [...registry.current.values()].map((g) => g()).filter(Boolean) as JunoAction[]
  const examples = useCallback(() => available().filter((a) => a.id !== 'turn_off_juno_mode').slice(0, 8).map((a) => a.description), []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── speaking and listening, one at a time ──
  /** Juno speaks; the microphone is closed meanwhile, so it never hears itself, and reopened afterwards. */
  const say = useCallback((text: string) => {
    const p = (async () => {
      setMessage(text)
      setPhase('speaking')
      capture.setMicMuted(true)
      await speakAndWait(text)
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
    if (enabledRef.current && phaseRef.current !== 'paused') setPhase('listening')
  }, [setPhase])

  // ── reading aloud ──
  const endReading = useCallback(() => {
    const job = readJob.current
    if (job) { job.stopped = true; job.player?.stop() }
    readJob.current = null
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

  const read = useCallback(async (runId: string, doc: ReadDoc, name?: string) => {
    if (readJob.current) endReading()
    stopSpeaking()
    const data = await getReading(runId, doc)
    const sections = data.sections.filter((x) => x.text.trim())
    if (sections.length === 0) throw new Error('There is nothing to read for that yet.')
    const job = { player: null as Player | null, jump: null as number | null, stopped: false }
    readJob.current = job
    busy.current = false
    lastActivity.current = Date.now()
    const title = name && !data.title.includes(name) ? `${data.title}, ${name}` : data.title
    setReading({ title, heading: sections[0].heading, index: 0, total: sections.length, paused: false, doc })

    const playing = (idx: number, paused = false) => setReading({ title, heading: sections[idx].heading, index: idx, total: sections.length, paused, doc })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: data.title, artist: 'Juno', album: name ?? 'AIA Voice Insights' })
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
      if (enabledRef.current) { setPhase('reading'); capture.setMicMuted(false) }
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
        id: 'turn_off_juno_mode', description: 'Turn Juno mode off', risk: 'open',
        run: () => { window.setTimeout(() => turnOff(), 900); return 'Okay, I’ll stop listening.' },
      }
      const all = [...actions, own]
      const screen = [...screens.current.values()].join('; ') || 'the app'
      const r = await junoCommand(utterance, screen, customer.current, all.map(({ id, description, risk, params }) => ({ id, description, risk, params })))
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
        const heard = await nextUtterance(CONFIRM_WAIT_MS)
        const verdict = heard ? parseYesNo(heard) : null
        if (verdict !== 'yes') return void (await say(verdict === 'no' ? 'Okay, I won’t.' : 'I didn’t hear a yes, so I haven’t done anything.'))
        const done = await action.run(r.params)
        chime('done')
        return void (await say(typeof done === 'string' && done ? done : 'Done.'))
      }

      // Opening, pointing, reading: just do it, saying so as it happens.
      const spoken = say(r.say)
      let result: string | void
      try {
        result = await action.run(r.params)
      } catch (e) {
        result = e instanceof Error ? e.message : 'That didn’t work.'
      }
      await spoken
      if (typeof result === 'string' && result) await say(result)
    } catch (e) {
      await say(e instanceof Error && /429|many/.test(e.message) ? 'That’s a lot of requests. Give me a few minutes.' : 'Sorry, I couldn’t work that out. Try again.')
    } finally {
      backToListening()
    }
  }, [backToListening, capture, endReading, nextUtterance, readControl, say, setPhase]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!enabledRef.current || phaseRef.current === 'speaking' || phaseRef.current === 'paused') continue
      if (deliver(text)) continue
      if (busy.current) continue
      if (readingRef.current) {
        // While reading, a short plain command ("pause", "next") is enough; anything else needs the name.
        const wakeR = parseWake(text)
        const ctl = parseReadControl(wakeR ? wakeR.rest : readMicOpen.current ? text : '')
        if (ctl) readControl(ctl)
        else if (wakeR && wakeR.rest.replace(/[^\p{L}\p{N}]/gu, '').length >= 3) void handleCommand(wakeR.rest)
        continue
      }
      const wake = parseWake(text)
      if (!wake) continue
      lastActivity.current = Date.now()
      if (wake.rest.replace(/[^\p{L}\p{N}]/gu, '').length >= 3) void handleCommand(wake.rest)
      else void awaken()
    }
  }, [capture.finalSegments, awaken, handleCommand, readControl])

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

  // The session opened (or fell over).
  useEffect(() => {
    if (!enabledRef.current) return
    if (capture.status === 'listening' && phaseRef.current === 'starting') {
      setPhase('listening')
    } else if ((capture.status === 'error' || capture.status === 'stopped') && phaseRef.current !== 'paused' && phaseRef.current !== 'off') {
      // The connection dropped: try again, but not in a loop.
      const now = Date.now()
      restarts.current = [...restarts.current.filter((t) => now - t < 60000), now]
      if (restarts.current.length > 4) return turnOff('Juno mode turned off: the microphone connection keeps dropping.')
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
      if (Date.now() - lastActivity.current > IDLE_OFF_MS) turnOff('Juno mode turned itself off after 15 quiet minutes.')
    }, 30000)
    const r = window.setInterval(() => {
      if (enabledRef.current && phaseRef.current === 'listening' && !busy.current) { capture.reset(); startListening() }
    }, RECYCLE_MS)
    return () => { window.clearInterval(t); window.clearInterval(r) }
  }, [enabled, capture, startListening, turnOff])

  // Escape stops whatever Juno is doing.
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
    enabled, reading, read, readControl, phase, caption: capture.partialText, message, amplitude: capture.amplitude, notice,
    toggle, acceptConsent, declineConsent, answer, examples, register, registerScreen,
  }), [enabled, reading, read, readControl, phase, capture.partialText, capture.amplitude, message, notice, toggle, acceptConsent, declineConsent, answer, examples, register, registerScreen])

  return <JunoModeContext.Provider value={value}>{children}</JunoModeContext.Provider>
}

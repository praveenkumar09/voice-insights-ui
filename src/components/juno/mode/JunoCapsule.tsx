import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useJunoMode, type JunoPhase, type ReadingState } from './JunoMode'

const LABEL: Partial<Record<JunoPhase, string>> = {
  starting: 'Getting ready…',
  listening: 'Say “Hey Juno”',
  awake: 'Listening…',
  thinking: 'One moment…',
  paused: 'Paused while the microphone is in use',
}

/** The living orb: a few soft colour fields that swirl, swell with the voice (the advisor's while listening) and change colour with what Juno is doing. */
function Orb({ phase, level, size = 'md' }: { phase: string; level: number; size?: 'md' | 'lg' }) {
  return (
    <span className={`jm-orb jm-orb--${phase} jm-orb--${size}`} style={{ ['--lvl' as string]: Math.min(1, level * 3.2).toFixed(3) }} aria-hidden>
      <i /><i /><i /><b />
    </span>
  )
}

const Icon = {
  pause: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1.4" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.4" fill="currentColor" /></svg>,
  play: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10-6.4a1 1 0 0 0 0-1.72l-10-6.4A1 1 0 0 0 8 5.6Z" fill="currentColor" /></svg>,
  next: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75l7.6-5.8a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2Z" fill="currentColor" /><rect x="16" y="5.5" width="3" height="13" rx="1.2" fill="currentColor" /></svg>,
  back: <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M19 6.2v11.6a.9.9 0 0 1-1.4.75L10 12.75a.9.9 0 0 1 0-1.5l7.6-5.8A.9.9 0 0 1 19 6.2Z" fill="currentColor" /><rect x="5" y="5.5" width="3" height="13" rx="1.2" fill="currentColor" /></svg>,
  stop: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" /></svg>,
}

/** The reading card: what Juno is reading, where it is, and Back, Pause, Next and Stop. */
function ReadingCard({ r, reduce, spring }: { r: ReadingState; reduce: boolean | null; spring: object }) {
  const j = useJunoMode()
  const pct = r.total <= 1 ? 0 : (r.index / r.total) * 100
  return (
    <motion.div key="reading" layout className="jm__cap jm__cap--reading is-expanded" initial={reduce ? false : { opacity: 0, y: -14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.94 }} transition={spring} role="status" aria-live="polite">
      <Orb phase={r.paused ? 'paused' : 'reading'} level={0.12} />
      <div className="jm__read">
        <p className="jm__read-title">{r.title}</p>
        <p className="jm__read-sub">{r.total > 1 ? `${r.heading || 'Reading'} · ${r.index + 1} of ${r.total}` : r.paused ? 'Paused' : 'Summary · say “read the full report” for more'}</p>
        {r.total > 1 && <span className="jm__prog" aria-hidden><i style={{ width: `${pct + 100 / r.total / 2}%` }} /></span>}
      </div>
      <div className="jm__ctl">
        {r.total > 1 && <button className="jm__ico" onClick={() => j.readControl('previous')} aria-label="Previous section">{Icon.back}</button>}
        <button className="jm__ico jm__ico--main" onClick={() => j.readControl(r.paused ? 'resume' : 'pause')} aria-label={r.paused ? 'Resume' : 'Pause'}>{r.paused ? Icon.play : Icon.pause}</button>
        {r.total > 1 && <button className="jm__ico" onClick={() => j.readControl('next')} aria-label="Next section">{Icon.next}</button>}
        <button className="jm__ico" onClick={() => j.readControl('stop')} aria-label="Stop reading">{Icon.stop}</button>
      </div>
    </motion.div>
  )
}

/**
 * Juno mode's presence on screen: a small dark capsule at the top, like a Dynamic Island. It stays quiet while it waits for its name,
 * grows when it is listening or speaking, and shows Yes and No when it needs a decision. It never covers the page's own controls.
 */
export function JunoCapsule() {
  const j = useJunoMode()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 34 }
  useEffect(() => { if (j.phase !== 'listening') setOpen(false) }, [j.phase])

  const expanded = j.phase === 'awake' || j.phase === 'speaking' || j.phase === 'confirming'
  const live = j.phase !== 'off' && j.phase !== 'consent' && !j.reading

  return (
    <div className="jm" role="region" aria-label="Juno mode">
      <AnimatePresence mode="popLayout">
        {j.phase === 'consent' && (
          <motion.div key="consent" className="jm__consent" layout initial={reduce ? false : { opacity: 0, y: -12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={spring} role="dialog" aria-label="Turn on Juno mode">
            <Orb phase="awake" level={0.1} size="lg" />
            <h2>Turn on Juno mode?</h2>
            <p>Juno will keep your microphone open and send what it hears to Azure speech to listen for “Hey Juno”. Nothing is saved.</p>
            <p>It turns itself off after 15 quiet minutes, and steps aside while you debrief or rehearse.</p>
            <div className="jm__consent-actions">
              <button className="jm__btn jm__btn--primary" onClick={j.acceptConsent} autoFocus>Turn on</button>
              <button className="jm__btn" onClick={j.declineConsent}>Not now</button>
            </div>
          </motion.div>
        )}

        {j.reading && <ReadingCard r={j.reading} reduce={reduce} spring={spring} />}

        {live && (
          <motion.div key="cap" layout className={`jm__cap jm__cap--${j.phase}${expanded ? ' is-expanded' : ''}`} initial={reduce ? false : { opacity: 0, y: -14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.94 }} transition={spring}>
            <button className="jm__main" onClick={() => j.phase === 'listening' && setOpen((v) => !v)} aria-expanded={j.phase === 'listening' ? open : undefined} disabled={j.phase !== 'listening'}>
              <Orb phase={j.phase} level={j.phase === 'awake' ? j.amplitude : 0} />
              <span className="jm__text">
                {j.phase === 'speaking' || j.phase === 'confirming' ? j.message : j.phase === 'awake' && j.caption ? <em>“{j.caption}”</em> : LABEL[j.phase]}
              </span>
            </button>
            {j.phase === 'confirming' && (
              <span className="jm__yesno">
                <button className="jm__btn jm__btn--primary" onClick={() => j.answer(true)}>Yes</button>
                <button className="jm__btn" onClick={() => j.answer(false)}>No</button>
              </span>
            )}
          </motion.div>
        )}

        {j.phase === 'off' && j.notice && (
          <motion.div key="notice" layout className="jm__cap jm__cap--notice" initial={reduce ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} role="status">
            <span className="jm__text">{j.notice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && j.phase === 'listening' && (
          <motion.div className="jm__sheet" initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={spring}>
            <p className="jm__sheet-title">Try saying</p>
            <ul>
              {j.examples().length === 0 && <li>“Hey Juno, what can you do?”</li>}
              {j.examples().map((e) => <li key={e}>“{e}”</li>)}
            </ul>
            <button className="jm__btn jm__btn--quiet" onClick={() => { setOpen(false); j.toggle() }}>Turn Juno mode off</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The switch in the header: a pearl and the name. Lit while Juno mode is on. */
export function JunoModeButton() {
  const j = useJunoMode()
  const on = j.enabled || j.phase === 'consent'
  return (
    <button className={`jm-btn${on ? ' is-on' : ''}`} onClick={j.toggle} aria-pressed={on} title={on ? 'Turn Juno mode off' : 'Turn Juno mode on: say “Hey Juno”'}>
      <span className={`jm-btn__pearl${on ? ' is-on' : ''}`} aria-hidden />
      Juno
    </button>
  )
}

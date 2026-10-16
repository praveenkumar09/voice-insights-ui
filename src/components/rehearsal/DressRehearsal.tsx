import { AnimatePresence, motion } from 'framer-motion'
import { Children, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRehearsal, type Beat } from '../../hooks/useRehearsal'

interface Props {
  profileId: string
  customerName: string
}

const BEAT_LABEL: Record<Beat, string> = {
  starting: 'Getting ready',
  listening: 'Your turn: speak or type',
  hearing: 'Listening to you',
  thinking: 'Thinking',
  speaking: 'Speaking',
  typing: 'Your turn: type your reply',
}

/**
 * Dress Rehearsal: Juno briefs the advisor on the next meeting (Brief), plays the customer so they can practise it (Rehearse), then
 * coaches (Coach's notes). Training only: the simulated customer is built from the debrief, and nothing here is saved or sent.
 */
export function DressRehearsal({ profileId, customerName }: Props) {
  const r = useRehearsal(profileId)
  const first = customerName.trim().split(/\s+/)[0] || 'the customer'
  const steps = ['Brief', 'Rehearse', 'Coach’s notes'] as const
  const stepNow = r.stage === 'idle' ? -1 : r.stage === 'briefing' || r.stage === 'brief' ? 0 : r.stage === 'rehearsing' ? 1 : 2

  return (
    <section className={`dr dr--${r.stage}`} aria-label="Dress rehearsal">
      <header className="dr__head">
        <div>
          <span className="dr__eyebrow">Dress rehearsal</span>
          <h3>Practise the next meeting with {first}</h3>
        </div>
        <ol className="dr__steps" aria-label="Rehearsal progress">
          {steps.map((s, i) => (
            <li key={s} className={i < stepNow || r.stage === 'done' ? 'is-done' : i === stepNow ? 'is-now' : ''}>
              <span>{i < stepNow || r.stage === 'done' ? '✓' : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        {r.stage !== 'idle' && (
          <button className={`dr__pill${r.voiceOn ? ' is-on' : ''}`} onClick={() => r.setVoiceOn(!r.voiceOn)} aria-pressed={r.voiceOn}>
            {r.voiceOn ? 'Voice on' : 'Captions only'}
          </button>
        )}
      </header>

      {r.error && <p className="dr__error" role="alert">{r.error}</p>}

      <AnimatePresence mode="wait" initial={false}>
        {r.stage === 'idle' && (
          <motion.div key="idle" className="dr__intro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p>
              Juno briefs you on {first} in under a minute. Then it plays {first}, using what you just told it, so you can run the meeting
              before the real one. Afterwards it coaches you: what landed, what you missed, and any promise you should word differently.
            </p>
            <div className="dr__actions">
              <button className="cta-btn" onClick={() => void r.startBrief()}>Brief me</button>
              <small>Training only: a simulation built from your debrief, not the real customer. Nothing is saved or sent.</small>
            </div>
          </motion.div>
        )}

        {r.stage === 'briefing' && (
          <motion.div key="briefing" className="dr__wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="polite">
            <span className="fu__dots"><i /><i /><i /></span> Juno is preparing your briefing…
          </motion.div>
        )}

        {r.stage === 'brief' && r.brief && (
          <motion.div key="brief" className="dr__brief" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="dr__juno">
              <span className={`dr__wave${r.speaker === 'juno' ? ' is-on' : ''}`} aria-hidden><i /><i /><i /><i /><i /></span>
              <p className="dr__script">{r.brief.script}</p>
            </div>
            {r.brief.thin && <p className="dr__thin">The debrief was short, so {first} will feel fairly general. The more you tell Juno, the more lifelike the rehearsal.</p>}
            <ul className="dr__points">
              {r.brief.points.map((p, i) => (
                <motion.li key={p.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 * i, duration: 0.35 }}>
                  <b>{p.label}</b>
                  <span>{p.text}</span>
                </motion.li>
              ))}
            </ul>
            <div className="dr__actions">
              <button className="cta-btn" onClick={() => void r.startRehearsal()}>Start rehearsal with {first}</button>
              <button className="ghost-btn" onClick={r.reset}>Not now</button>
              <small>{first} speaks aloud. Answer out loud, or type if you prefer.</small>
            </div>
          </motion.div>
        )}

        {r.stage === 'rehearsing' && <Stage key="stage" r={r} first={first} />}

        {r.stage === 'scoring' && (
          <motion.div key="scoring" className="dr__wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="polite">
            <span className="fu__dots"><i /><i /><i /></span> Your coach is reviewing the rehearsal…
          </motion.div>
        )}

        {r.stage === 'done' && r.scorecard && (
          <motion.div key="done" className="dr__notes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="dr__notes-top">
              <span className={`dr__rating dr__rating--${r.scorecard.rating.toLowerCase().replace(/\s+/g, '-')}`}>{r.scorecard.rating}</span>
              <p>{r.scorecard.summary}</p>
            </div>
            <div className="dr__grid">
              <NotesCard title="What landed" tone="good" empty="Nothing stood out yet.">
                {r.scorecard.handled.map((h) => <li key={h.need}><b>{h.need}</b><span>{h.how}</span></li>)}
                {r.scorecard.strong.map((s) => <li key={s.quote}><q>{s.quote}</q><span>{s.why}</span></li>)}
              </NotesCard>
              <NotesCard title="What you missed" tone="gap" empty="You covered what mattered.">
                {r.scorecard.missed.map((m) => <li key={m.need}><b>{m.need}</b><span>{m.tip}</span></li>)}
              </NotesCard>
              <NotesCard title="Say it differently" tone="risk" empty="No risky wording. Well done.">
                {r.scorecard.slips.map((s) => (
                  <li key={s.quote}><q>{s.quote}</q><span>{s.why}</span><em>Try: {s.better}</em></li>
                ))}
              </NotesCard>
            </div>
            {r.scorecard.opener && (
              <div className="dr__opener">
                <small>Open the real meeting with</small>
                <p>“{r.scorecard.opener}”</p>
              </div>
            )}
            <div className="dr__actions">
              <button className="cta-btn" onClick={() => void r.startRehearsal()}>Rehearse again</button>
              <button className="ghost-btn" onClick={r.reset}>Close</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function NotesCard({ title, tone, empty, children }: { title: string; tone: 'good' | 'gap' | 'risk'; empty: string; children: React.ReactNode }) {
  const has = Children.toArray(children).length > 0
  return (
    <div className={`dr__card dr__card--${tone}`}>
      <div className="glass-card__label">{title}</div>
      {has ? <ul>{children}</ul> : <p className="dr__empty">{empty}</p>}
    </div>
  )
}

function Stage({ r, first }: { r: ReturnType<typeof useRehearsal>; first: string }) {
  const [typed, setTyped] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const flagged = [...r.messages].reverse().find((m) => m.flag)
  const canType = r.beat === 'typing' || r.beat === 'listening' || r.beat === 'hearing' || r.beat === 'speaking'

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [r.messages.length])

  function send(e: React.FormEvent) {
    e.preventDefault()
    if (!typed.trim()) return
    r.submitAdvisor(typed)
    setTyped('')
  }

  const mode = r.speaker === 'customer' ? 'speaking' : r.beat === 'hearing' ? 'hearing' : r.beat === 'thinking' ? 'thinking' : 'idle'
  const label = r.speaker === 'customer' ? `${first} is speaking` : BEAT_LABEL[r.beat]

  return (
    <motion.div className="dr__stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="dr__presence">
        <button
          className={`dr__avatar dr__avatar--${mode}`}
          style={{ ['--lvl' as string]: Math.min(1, r.amplitude * 3) } as CSSProperties}
          onClick={r.tapMic}
          aria-label={r.beat === 'hearing' ? 'I am done speaking' : r.speaker === 'customer' ? 'Cut in' : first}
        >
          <i /><i />
          <span>{first[0]?.toUpperCase()}</span>
        </button>
        <div className="dr__state" aria-live="polite"><span />{label}</div>
        <p className="dr__sim">Simulation: {first} is played by Juno from your debrief</p>
        {r.beat === 'hearing' && r.caption && <p className="dr__caption">{r.caption}</p>}
        {r.hint && <p className="dr__hint">{r.hint}</p>}
      </div>

      <div className="dr__talk">
        <div className="dr__coach" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {flagged?.flag ? (
              <motion.div key={flagged.id} className={`dr__flag dr__flag--${flagged.flag.severity}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <em>Coach · {flagged.flag.severity === 'high' ? 'High risk' : 'Caution'}</em>
                <q>{flagged.flag.statement}</q>
                <span>{flagged.flag.advice}</span>
              </motion.div>
            ) : (
              <motion.div key="ok" className="dr__flag dr__flag--ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <em>Coach</em>
                <span>Listening. I will flag any promise or pressure the moment you say it.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="dr__chat" ref={listRef}>
          {r.messages.filter((m) => m.shown).map((m) => (
            <motion.div key={m.id} className={`dr__bubble dr__bubble--${m.role}${m.flag ? ' is-flagged' : ''}`} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.28 }}>
              <small>{m.role === 'customer' ? first : 'You'}</small>
              {m.text}
            </motion.div>
          ))}
          {r.beat === 'thinking' && <div className="dr__bubble dr__bubble--customer dr__bubble--typing" aria-label={`${first} is thinking`}><span className="fu__dots"><i /><i /><i /></span></div>}
        </div>

        <form className="dr__type" onSubmit={send}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Say it to ${first}, or type it here…`} aria-label={`Your reply to ${first}`} disabled={!canType} />
          <button className="ghost-btn" type="submit" disabled={!typed.trim() || !canType}>Send</button>
          <button className="cta-btn" type="button" onClick={() => void r.finish()} disabled={!r.canScore}>End &amp; get coach’s notes</button>
        </form>
      </div>
    </motion.div>
  )
}

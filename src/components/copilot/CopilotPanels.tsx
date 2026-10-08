import { relevanceBand, relevanceLabel } from '../../utils/relevance'
import { AnimatePresence, motion } from 'framer-motion'
import type { CopilotInsights } from '../../types'

const enter = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }

/** The agent's eyes are on the customer, so the single best next question is shown large; the rest are quiet chips. */
const KIND_LABEL: Record<string, string> = {
  followup: 'Follow up', objection: 'Handle concern', clarify: 'Clarify', gap: 'Fill a gap', close: 'Next step',
}

export function NextQuestions({ questions, context }: { questions: string[]; context?: CopilotInsights['askContext'] }) {
  const [primary, ...rest] = questions
  return (
    <div className="glass-card ask-strip">
      <div className="glass-card__label">
        Ask next <span className="live-tag">Copilot</span>
      </div>
      {!primary ? (
        <p className="panel-empty">Suggested questions will appear as the conversation unfolds.</p>
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.p className="ask-strip__primary" key={primary} {...enter} transition={{ duration: 0.35 }}>
              {primary}
            </motion.p>
          </AnimatePresence>
          {context && (
            <p className="ask-strip__why">
              <b>{KIND_LABEL[context.kind] ?? 'Follow up'}</b>
              {context.trigger && <span>They just said “{context.trigger}”</span>}
            </p>
          )}
          {rest.length > 0 && (
            <div className="ask-strip__chips">
              <AnimatePresence initial={false}>
                {rest.map((q) => (
                  <motion.span className="ask-chip" key={q} layout {...enter} transition={{ duration: 0.3 }}>
                    {q}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function NeedTags({ needs }: { needs: CopilotInsights['needs'] }) {
  return (
    <div className="glass-card">
      <div className="glass-card__label">Detected needs</div>
      {needs.length === 0 ? (
        <p className="panel-empty">Needs light up as the customer describes their situation.</p>
      ) : (
        <ul className="need-list">
          <AnimatePresence initial={false}>
            {needs.map((n) => (
              <motion.li className="need-list__item" key={n.label} layout {...enter} transition={{ duration: 0.3 }}>
                <div className="need-list__row">
                  <span>{n.label}</span>
                  <span className="need-list__pct">{n.strength}%</span>
                </div>
                <div className="need-list__bar">
                  <span style={{ width: `${Math.max(4, Math.min(100, n.strength))}%` }} />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

export function ProductMatches({ matches }: { matches: CopilotInsights['productMatches'] }) {
  return (
    <div className="glass-card">
      <div className="glass-card__label">
        Live product matches <span className="live-tag">Grounded in product docs</span>
      </div>
      {matches.length === 0 ? (
        <p className="panel-empty">Candidate products form and re-rank as needs emerge.</p>
      ) : (
        <ul className="match-list">
          <AnimatePresence initial={false}>
            {matches.map((m, i) => (
              <motion.li
                className="match-card"
                key={m.productName}
                layout
                {...enter}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              >
                <div className="match-card__rank">{i + 1}</div>
                <div className="match-card__body">
                  <div className="match-card__name">{m.productName}</div>
                  <p className="match-card__evidence">“{m.evidence}”</p>
                  <span className="match-card__source">{m.source}</span>
                </div>
                <div className={`relevance relevance--${relevanceBand(m.fitScore)}`}>{relevanceLabel(m.fitScore)}</div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

export function ComplianceWatch({ flags, active }: { flags: CopilotInsights['complianceFlags']; active: boolean }) {
  const clear = active && flags.length === 0
  return (
    <div className={`glass-card compliance-card${flags.length ? ' has-flags' : ''}`}>
      <div className="glass-card__label">Compliance watch</div>
      {!active && <p className="panel-empty">Monitoring starts with the conversation.</p>}
      {clear && (
        <p className="compliance-card__clear">
          <span className="compliance-card__tick">✓</span> No risky statements detected
        </p>
      )}
      <AnimatePresence initial={false}>
        {flags.map((f, i) => (
          <motion.div className={`flag flag--${f.severity}`} key={`${f.statement}-${i}`} {...enter}>
            <div className="flag__head">
              <span className="flag__sev">{f.severity === 'high' ? 'High risk' : 'Caution'}</span>
              <span className="flag__quote">“{f.statement}”</span>
            </div>
            <p className="flag__advice">{f.advice}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

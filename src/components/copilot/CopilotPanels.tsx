import type { CopilotInsights } from '../../types'

export function NextQuestions({ questions }: { questions: string[] }) {
  return (
    <div className="glass-card ask-strip">
      <div className="glass-card__label">
        Ask next <span className="live-tag">Copilot</span>
      </div>
      {questions.length === 0 ? (
        <p className="panel-empty">Suggested questions will appear as the conversation unfolds.</p>
      ) : (
        <div className="ask-strip__chips">
          {questions.map((q) => (
            <span className="ask-chip" key={q}>
              {q}
            </span>
          ))}
        </div>
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
          {needs.map((n) => (
            <li className="need-list__item" key={n.label}>
              <div className="need-list__row">
                <span>{n.label}</span>
                <span className="need-list__pct">{n.strength}%</span>
              </div>
              <div className="need-list__bar">
                <span style={{ width: `${Math.max(4, Math.min(100, n.strength))}%` }} />
              </div>
            </li>
          ))}
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
          {matches.map((m, i) => (
            <li className="match-card" key={m.productName}>
              <div className="match-card__rank">{i + 1}</div>
              <div className="match-card__body">
                <div className="match-card__name">{m.productName}</div>
                <p className="match-card__evidence">“{m.evidence}”</p>
                <span className="match-card__source">{m.source}</span>
              </div>
              <div className="match-card__fit" style={{ ['--fit' as string]: m.fitScore }}>
                <span>{m.fitScore}</span>
                <small>fit</small>
              </div>
            </li>
          ))}
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
      {flags.map((f, i) => (
        <div className={`flag flag--${f.severity}`} key={i}>
          <div className="flag__head">
            <span className="flag__sev">{f.severity === 'high' ? 'High risk' : 'Caution'}</span>
            <span className="flag__quote">“{f.statement}”</span>
          </div>
          <p className="flag__advice">{f.advice}</p>
        </div>
      ))}
    </div>
  )
}

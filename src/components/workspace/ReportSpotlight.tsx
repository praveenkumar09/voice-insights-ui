import type { AgentState } from '../../hooks/useRecommendationStream'
import type { AgentKey, CustomerPersonaResult, ProductScoringResult, ProductShortlistResult } from '../../types'

/** The recommendation itself, up front: the shortlisted products, ranked, with their fit and the reasons in plain words. */
export function ReportSpotlight({ steps }: { steps: Record<AgentKey, AgentState> }) {
  const shortlist = steps.productShortlist.status === 'done' ? (steps.productShortlist.result as ProductShortlistResult) : null
  const scoring = steps.productScoring.status === 'done' ? (steps.productScoring.result as ProductScoringResult) : null
  const persona = steps.persona.status === 'done' ? (steps.persona.result as CustomerPersonaResult) : null
  if (!shortlist?.shortlistedProducts?.length) return null

  return (
    <section className="spotlight">
      <div className="spotlight__head">
        <h3>Recommended for this customer</h3>
        {persona && <span className="spotlight__persona">{persona.personaLabel} · {persona.lifeStage}</span>}
      </div>
      <div className="spotlight__cards">
        {shortlist.shortlistedProducts.map((name, i) => {
          const sc = scoring?.scores.find((s) => s.productName.toLowerCase() === name.toLowerCase())
          const score = sc?.score ?? 0
          return (
            <article key={name} className={`spotlight__card${i === 0 ? ' is-top' : ''}`}>
              <div className="spotlight__rank">{i === 0 ? 'Best match' : `Option ${i + 1}`}</div>
              <div className="spotlight__main">
                <Ring value={score} />
                <div>
                  <h4>{name}</h4>
                  {sc?.matchReasons?.[0] && <p>{sc.matchReasons[0]}</p>}
                </div>
              </div>
              {sc?.matchReasons && sc.matchReasons.length > 1 && (
                <ul>{sc.matchReasons.slice(1, 3).map((r) => <li key={r}>{r}</li>)}</ul>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Ring({ value }: { value: number }) {
  const R = 22
  const C = 2 * Math.PI * R
  return (
    <div className="ring" aria-label={`${value}% fit`}>
      <svg viewBox="0 0 56 56">
        <circle className="ring__track" cx="28" cy="28" r={R} />
        <circle className="ring__fill" cx="28" cy="28" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(100, value)) / 100)} />
      </svg>
      <b>{value}<small>%</small></b>
    </div>
  )
}

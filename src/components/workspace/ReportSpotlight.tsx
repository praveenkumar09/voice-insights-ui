import { useState } from 'react'
import { relevanceBand, relevanceLabel } from '../../utils/relevance'
import type { AgentState } from '../../hooks/useRecommendationStream'
import type { AgentKey, CustomerPersonaResult, ProductScoringResult, ProductShortlistResult, RagValidationResult } from '../../types'

/** The suggestion itself, up front: the shortlisted products, ranked, with how relevant each is and the reasons in plain words. */
export function ReportSpotlight({ steps, onOpenHow }: { steps: Record<AgentKey, AgentState>; onOpenHow?: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const shortlist = steps.productShortlist.status === 'done' ? (steps.productShortlist.result as ProductShortlistResult) : null
  const scoring = steps.productScoring.status === 'done' ? (steps.productScoring.result as ProductScoringResult) : null
  const validation = steps.ragValidation.status === 'done' ? (steps.ragValidation.result as RagValidationResult) : null
  const persona = steps.persona.status === 'done' ? (steps.persona.result as CustomerPersonaResult) : null
  if (!shortlist?.shortlistedProducts?.length) return null

  return (
    <section className="spotlight">
      <div className="spotlight__head">
        <h3>Suggested for this customer</h3>
        {persona && <span className="spotlight__persona">{persona.personaLabel} · {persona.lifeStage}</span>}
      </div>
      <div className="spotlight__cards">
        {shortlist.shortlistedProducts.map((name, i) => {
          const sc = scoring?.scores.find((s) => s.productName.toLowerCase() === name.toLowerCase())
          const score = sc?.score ?? 0
          return (
            <article key={name} className={`spotlight__card${i === 0 ? ' is-top' : ''}`}>
              <div className="spotlight__rank">{i === 0 ? 'Top suggestion' : `Option ${i + 1}`}</div>
              <div className="spotlight__main">
                <span className={`relevance relevance--${relevanceBand(score)}`}>{relevanceLabel(score)}</span>
                <div>
                  <h4>{name}</h4>
                  {sc?.matchReasons?.[0] && <p>{sc.matchReasons[0]}</p>}
                </div>
              </div>
              {sc?.matchReasons && sc.matchReasons.length > 1 && (
                <ul>{sc.matchReasons.slice(1, 3).map((r) => <li key={r}>{r}</li>)}</ul>
              )}
              {(() => {
                const more = sc?.matchReasons?.slice(3) ?? []
                const concerns = sc?.concerns ?? []
                const evidence = (validation?.citations ?? []).filter((c) => c.productName.toLowerCase() === name.toLowerCase()).slice(0, 2)
                if (more.length + concerns.length + evidence.length === 0 && !onOpenHow) return null
                const isOpen = open === name
                return (
                  <div className="spotlight__why">
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : name)}>{isOpen ? 'Hide ▴' : 'Why this? ▾'}</button>
                    {isOpen && (
                      <div className="spotlight__why-body">
                        {more.length > 0 && <div><b>Also fits</b><ul>{more.map((r) => <li key={r}>{r}</li>)}</ul></div>}
                        {concerns.length > 0 && <div><b>Worth checking</b><ul>{concerns.map((r) => <li key={r}>{r}</li>)}</ul></div>}
                        {evidence.length > 0 && <div><b>In the product documents</b>{evidence.map((c, k) => <blockquote key={k}>{c.excerpt}<small>{c.docCategory} · {c.sourceFile}</small></blockquote>)}</div>}
                        {onOpenHow && <button type="button" className="spotlight__more" onClick={onOpenHow}>See every agent’s reasoning →</button>}
                      </div>
                    )}
                  </div>
                )
              })()}
            </article>
          )
        })}
      </div>
    </section>
  )
}

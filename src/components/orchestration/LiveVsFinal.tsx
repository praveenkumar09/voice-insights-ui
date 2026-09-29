import type { AgentState } from '../../hooks/useRecommendationStream'
import type { AgentKey, CopilotInsights, MergedInsights, ProductShortlistResult, SignalPoint } from '../../types'

interface Props {
  live: { latest: CopilotInsights; history: SignalPoint[] } | null
  steps: Record<AgentKey, AgentState>
}

type Verdict = 'confirmed' | 'refined' | 'new'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
/** Final need categories look like "Family protection – Term Life"; the live label is the part before the dash. */
const needHead = (s: string) => norm(s.split(/\s[–-]\s/)[0])

function Badge({ verdict }: { verdict: Verdict }) {
  const text = verdict === 'confirmed' ? 'Confirmed' : verdict === 'new' ? 'New in final' : 'Refined'
  return <span className={`lvf-badge lvf-badge--${verdict}`}>{text}</span>
}

/**
 * Live copilot output vs the full agent analysis. The live layer is the
 * first impression during the call; the agents are the source of truth —
 * this panel makes any difference between them visible and explained,
 * instead of leaving the viewer to spot an unexplained contradiction.
 */
export function LiveVsFinal({ live, steps }: Props) {
  const merged = steps.merge.status === 'done' ? (steps.merge.result as MergedInsights) : null
  const shortlist = steps.productShortlist.status === 'done' ? (steps.productShortlist.result as ProductShortlistResult) : null
  if (!live?.latest || (!merged && !shortlist)) return null

  const liveNeeds = live.latest.needs.map((n) => norm(n.label))
  const finalNeeds = merged?.needs.recommendedCategories ?? []
  const liveProducts = live.latest.productMatches.map((p) => norm(p.productName))
  const finalProducts = shortlist?.shortlistedProducts ?? []
  const flags = live.latest.complianceFlags

  const refinedOutProducts = live.latest.productMatches.filter(
    (p) => !finalProducts.some((f) => norm(f) === norm(p.productName)),
  )
  const droppedNeeds = live.latest.needs.filter((n) => !finalNeeds.some((f) => needHead(f) === norm(n.label)))

  return (
    <div className="glass-card lvf">
      <div className="lvf__head">
        <div>
          <div className="glass-card__label lvf__title">Live vs final analysis</div>
          <p className="lvf__sub">
            <b>Live</b> is the copilot&rsquo;s first impression during the call. <b>Final</b> is the full agent analysis and is the
            recommendation of record.
          </p>
        </div>
        <div className="lvf__signals">
          <span className="lvf__pill">Sentiment · {live.latest.sentiment.label}</span>
          <span className="lvf__pill">Buying · {live.latest.buyingSignal.level}</span>
        </div>
      </div>

      <div className="lvf__grid">
        <div>
          <h4 className="lvf__h">Needs</h4>
          {finalNeeds.length === 0 && <p className="panel-empty">Waiting for the final analysis…</p>}
          <ul className="lvf__list">
            {finalNeeds.map((n) => (
              <li key={n}>
                <span>{n}</span>
                <Badge verdict={liveNeeds.includes(needHead(n)) ? 'confirmed' : 'new'} />
              </li>
            ))}
            {droppedNeeds.map((n) => (
              <li className="lvf__muted" key={n.label}>
                <span>{n.label} (live only)</span>
                <Badge verdict="refined" />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="lvf__h">Products</h4>
          {finalProducts.length === 0 && <p className="panel-empty">Waiting for the shortlist…</p>}
          <ul className="lvf__list">
            {finalProducts.map((p) => (
              <li key={p}>
                <span>{p}</span>
                <Badge verdict={liveProducts.includes(norm(p)) ? 'confirmed' : 'new'} />
              </li>
            ))}
            {shortlist &&
              refinedOutProducts.map((p) => (
                <li className="lvf__muted" key={p.productName}>
                  <span>{p.productName} (live suggestion)</span>
                  <Badge verdict="refined" />
                </li>
              ))}
          </ul>
        </div>
      </div>

      {flags.length > 0 && (
        <div className="lvf__flags">
          <div className="lvf__flags-title">
            Advisor conduct flags <span className="live-tag">Report only</span>
          </div>
          <p className="lvf__flags-note">
            Raised live during the call. They are included in the sales report for review and do not change the recommendation.
          </p>
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
      )}
    </div>
  )
}

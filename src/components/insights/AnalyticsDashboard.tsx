import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { getAnalytics } from '../../api/client'
import type { AnalyticsCount, AnalyticsResult } from '../../types'

const RANGES = [7, 30, 90]

interface Props {
  onViewRun: (runId: string) => void
}

export function AnalyticsDashboard({ onViewRun }: Props) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<AnalyticsResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    getAnalytics(days)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load analytics'))
    return () => {
      cancelled = true
    }
  }, [days])

  return (
    <div className="insights">
      <div className="insights__bar">
        <div>
          <h3 className="insights__title">Sales intelligence</h3>
          <p className="insights__sub">Every number below is computed from captured conversations and agent outputs.</p>
        </div>
        <div className="insights__range" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} className={days === r ? 'is-active' : ''} onClick={() => setDays(r)}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error && <p className="admin-screen__status admin-screen__status--error">{error}</p>}
      {!data && !error && <p className="admin-screen__status">Loading&hellip;</p>}

      {data && data.totals.analysed === 0 && (
        <div className="glass-card insights__empty">
          <strong>No analysed conversations in the last {days} days.</strong>
          <p>Capture a conversation on the Home page and this dashboard fills in automatically.</p>
        </div>
      )}

      {data && data.totals.analysed > 0 && <Body data={data} onViewRun={onViewRun} />}
    </div>
  )
}

function Body({ data, onViewRun }: { data: AnalyticsResult; onViewRun: (id: string) => void }) {
  const t = data.totals
  const complianceRate = data.compliance.reviewedRuns
    ? Math.round((100 * data.compliance.compliantRuns) / data.compliance.reviewedRuns)
    : null
  const hotPct = Math.round((100 * data.pipeline.hot) / t.analysed)

  return (
    <motion.div className="insights__grid" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
      <Reveal className="insights__takeaways glass-card">
        <div className="glass-card__label">Key takeaways</div>
        <ul>
          {data.takeaways.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Reveal>

      <div className="insights__kpis">
        <Kpi label="Conversations analysed" value={t.analysed} />
        <Kpi label="Hot leads" value={data.pipeline.hot} suffix={` · ${hotPct}%`} accent />
        <Kpi label="Avg buying signal" value={t.avgBuyingSignal} suffix=" / 100" decimals={1} />
        <Kpi label="Recommendations run" value={t.recommendations} />
        <Kpi label="Compliance pass rate" value={complianceRate} suffix="%" empty="—" />
      </div>

      <Reveal className="glass-card">
        <div className="glass-card__label">Pipeline — buying signal</div>
        <StackBar
          parts={[
            { label: 'Hot (70+)', value: data.pipeline.hot, color: 'var(--c-hot)' },
            { label: 'Warm (40–69)', value: data.pipeline.warm, color: 'var(--c-warm)' },
            { label: 'Cold (<40)', value: data.pipeline.cold, color: 'var(--c-cold)' },
          ]}
        />
        <div className="glass-card__label insights__spaced">Customer sentiment</div>
        <StackBar
          parts={[
            { label: 'Positive', value: data.sentiment.positive, color: 'var(--c-pos)' },
            { label: 'Neutral', value: data.sentiment.neutral, color: 'var(--c-cold)' },
            { label: 'Negative', value: data.sentiment.negative, color: 'var(--c-neg)' },
          ]}
        />
      </Reveal>

      <Reveal className="glass-card">
        <div className="glass-card__label">Conversations per day</div>
        <Bars points={data.trend.map((d) => ({ x: d.date, y: d.conversations }))} unit="conversations" />
        <div className="glass-card__label insights__spaced">Average buying signal</div>
        <Line points={data.trend.filter((d) => d.conversations > 0).map((d) => ({ x: d.date, y: d.avgBuyingSignal }))} />
      </Reveal>

      <Reveal className="glass-card">
        <div className="glass-card__label">Top customer needs</div>
        <HBars rows={data.topNeeds} unit="conversations" />
      </Reveal>

      <Reveal className="glass-card">
        <div className="glass-card__label">Most recommended products</div>
        <HBars rows={data.topProducts} unit="shortlists" empty="Run recommendations to see product popularity." />
      </Reveal>

      <Reveal className="glass-card insights__wide">
        <div className="glass-card__label">Hot leads to follow up</div>
        {data.leadsToFollowUp.length === 0 ? (
          <p className="panel-empty">No hot leads in this period.</p>
        ) : (
          <ul className="leads">
            {data.leadsToFollowUp.map((l) => (
              <li key={l.profileId}>
                <span className="leads__score">{l.buyingSignal}</span>
                <span className="leads__who">
                  <strong>{l.customerName ?? 'Unnamed customer'}</strong>
                  <small>{l.topNeed ? `Top need: ${l.topNeed}` : 'No need detected'} · {new Date(l.capturedAt).toLocaleDateString()}</small>
                </span>
                {l.latestRunId ? (
                  <button className="admin-table__view-btn" onClick={() => onViewRun(l.latestRunId!)}>
                    View recommendation
                  </button>
                ) : (
                  <span className="admin-table__muted">Not yet analysed</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal className="glass-card">
        <div className="glass-card__label">Compliance</div>
        <dl className="insights__stats">
          <div><dt>Conversations with live flags</dt><dd>{data.compliance.conversationsWithFlags}</dd></div>
          <div><dt>High-risk statements</dt><dd>{data.compliance.highRiskFlags}</dd></div>
          <div><dt>Caution statements</dt><dd>{data.compliance.cautionFlags}</dd></div>
          <div><dt>Recommendations passing review</dt><dd>{data.compliance.compliantRuns} / {data.compliance.reviewedRuns}</dd></div>
        </dl>
      </Reveal>

      <Reveal className="glass-card">
        <div className="glass-card__label">Agent leaderboard</div>
        <table className="admin-table insights__table">
          <thead>
            <tr><th>Agent</th><th>Convos</th><th>Avg signal</th><th>Hot</th><th>Flags</th></tr>
          </thead>
          <tbody>
            {data.agents.map((a) => (
              <tr key={a.agent}>
                <td>{a.agent}</td><td>{a.conversations}</td><td>{a.avgBuyingSignal}</td><td>{a.hotLeads}</td><td>{a.complianceFlags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </motion.div>
  )
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.4 }}>
      {children}
    </motion.div>
  )
}

function useCountUp(target: number, decimals = 0) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 800)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v.toFixed(decimals)
}

function Kpi({ label, value, suffix = '', decimals = 0, accent, empty }: { label: string; value: number | null; suffix?: string; decimals?: number; accent?: boolean; empty?: string }) {
  const shown = useCountUp(value ?? 0, decimals)
  return (
    <Reveal className={`glass-card kpi${accent ? ' kpi--accent' : ''}`}>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value === null ? empty : shown}<small>{value === null ? '' : suffix}</small></span>
    </Reveal>
  )
}

function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div className="stack">
      <div className="stack__bar" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.label} style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${p.value} (${Math.round((100 * p.value) / total)}%)`} />
        ))}
      </div>
      <ul className="stack__legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b>{p.value}</b> <small>{Math.round((100 * p.value) / total)}%</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HBars({ rows, unit, empty = 'Nothing detected yet.' }: { rows: AnalyticsCount[]; unit: string; empty?: string }) {
  if (rows.length === 0) return <p className="panel-empty">{empty}</p>
  const max = Math.max(...rows.map((r) => r.count))
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.count} ${unit}`}>
          <span className="hbars__label">{r.label}</span>
          <span className="hbars__track"><motion.span initial={{ width: 0 }} animate={{ width: `${(100 * r.count) / max}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} /></span>
          <b>{r.count}</b>
        </li>
      ))}
    </ul>
  )
}

const W = 420
const H = 120

function Bars({ points, unit }: { points: { x: string; y: number }[]; unit: string }) {
  const max = Math.max(1, ...points.map((p) => p.y))
  const bw = W / points.length
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="chart" role="img" aria-label="Conversations per day">
      <line x1="0" x2={W} y1={H} y2={H} className="chart__axis" />
      {points.map((p, i) => {
        const h = (p.y / max) * (H - 8)
        return (
          <g key={p.x}>
            <rect x={i * bw + 2} y={H - h} width={Math.max(2, bw - 4)} height={h} rx="3" className="chart__bar">
              <title>{`${p.x}: ${p.y} ${unit}`}</title>
            </rect>
          </g>
        )
      })}
      <text x="0" y={H + 14} className="chart__tick">{points[0]?.x.slice(5)}</text>
      <text x={W} y={H + 14} textAnchor="end" className="chart__tick">{points[points.length - 1]?.x.slice(5)}</text>
    </svg>
  )
}

function Line({ points }: { points: { x: string; y: number }[] }) {
  if (points.length < 2) return <p className="panel-empty">Needs conversations on at least two days.</p>
  const x = (i: number) => 6 + (i / (points.length - 1)) * (W - 12)
  const y = (v: number) => H - (v / 100) * (H - 8)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="chart" role="img" aria-label="Average buying signal by day">
      <line x1="0" x2={W} y1={H} y2={H} className="chart__axis" />
      <line x1="0" x2={W} y1={y(70)} y2={y(70)} className="chart__ref" />
      <text x={W} y={y(70) - 4} textAnchor="end" className="chart__tick">hot = 70</text>
      <path d={d} className="chart__line" />
      {points.map((p, i) => (
        <circle key={p.x} cx={x(i)} cy={y(p.y)} r="4" className="chart__dot"><title>{`${p.x}: ${p.y}`}</title></circle>
      ))}
    </svg>
  )
}

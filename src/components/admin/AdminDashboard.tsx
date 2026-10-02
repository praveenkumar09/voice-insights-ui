import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getAnalytics } from '../../api/client'
import type { AnalyticsResult } from '../../types'
import { ChartCard, Funnel, HBarList, Heatmap, Meter, Sparkline, SplitBar, TrendChart } from './AdminCharts'
import { delta, initials, shortDate, shortName, timeAgo, type Delta, WEEKDAYS } from './format'
import { useCountUp } from './useCountUp'

const RANGES = [7, 30, 90]

/** Estimated after-meeting paperwork an advisor no longer does for each signed-off advice pack. An assumption, shown as one. */
const MINUTES_SAVED_PER_PACK = 45

interface Props {
  onViewRun: (runId: string) => void
}

export function AdminDashboard({ onViewRun }: Props) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<AnalyticsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getAnalytics(days)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [days])

  return (
    // While a new range loads, the previous render stays on screen, dimmed — no skeleton, no layout jump.
    <div className={`adm-dash${loading && data ? ' is-loading' : ''}`}>
      <Hero data={data} days={days} setDays={setDays} />
      {error && <p className="adm-error">{error}</p>}
      {!data && !error && <p className="adm-status">Loading the numbers…</p>}
      {data && data.totals.analysed === 0 && (
        <div className="adm-card adm-empty-card">
          <strong>No analysed conversations in the last {days} days.</strong>
          <p>Capture a conversation on the Home page and this dashboard fills in by itself.</p>
        </div>
      )}
      {data && data.totals.analysed > 0 && <Body data={data} days={days} onViewRun={onViewRun} />}
    </div>
  )
}

// ── Hero ───────────────────────────────────────────────────────────────────────

function Hero({ data, days, setDays }: { data: AnalyticsResult | null; days: number; setDays: (d: number) => void }) {
  const analysed = data?.totals.analysed ?? 0
  const count = useCountUp(analysed, 1300)
  const d = data?.previous ? delta(analysed, data.previous.analysed) : null
  const trend = data?.trend.map((t) => t.conversations) ?? []

  // The takeaways take turns in the banner.
  const tips = data?.takeaways ?? []
  const [i, setI] = useState(0)
  useEffect(() => {
    if (tips.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % tips.length), 6500)
    return () => clearInterval(t)
  }, [tips.length])

  return (
    <header className="adm-hero">
      <div className="adm-hero__glow adm-hero__glow--a" />
      <div className="adm-hero__glow adm-hero__glow--b" />
      <div className="adm-hero__top">
        <div>
          <span className="adm-hero__eyebrow">Sales intelligence</span>
          <h2>What the conversations are telling us</h2>
        </div>
        <div className="adm-range" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} className={days === r ? 'is-active' : ''} aria-pressed={days === r} onClick={() => setDays(r)}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="adm-hero__body">
        <div className="adm-hero__figure">
          <div className="adm-hero__number">{count.toLocaleString()}</div>
          <div className="adm-hero__caption">
            conversations analysed in the last {days} days
            {d && <DeltaChip d={d} label={`vs previous ${days} days`} onDark />}
          </div>
        </div>
        <Sparkline points={trend} />
        {tips.length > 0 && (
          <div className="adm-hero__insight" aria-live="polite">
            <small>Insight {Math.min(i + 1, tips.length)} of {tips.length}</small>
            <p key={i}>{tips[Math.min(i, tips.length - 1)]}</p>
          </div>
        )}
      </div>
    </header>
  )
}

// ── Tiles ──────────────────────────────────────────────────────────────────────

function DeltaChip({ d, label, onDark }: { d: Delta; label: string; onDark?: boolean }) {
  if (d.dir === 'flat' && d.pct == null) return null
  const text = d.dir === 'new' ? 'New' : d.dir === 'flat' ? 'No change' : `${Math.abs(d.pct ?? 0)}%`
  const icon = d.dir === 'up' || d.dir === 'new' ? '▲' : d.dir === 'down' ? '▼' : '—'
  return (
    <span className={`adm-delta adm-delta--${d.dir}${onDark ? ' on-dark' : ''}`}>
      <i aria-hidden>{icon}</i> {text} <em>{label}</em>
    </span>
  )
}

function Tile(props: {
  label: string
  value: number
  decimals?: number
  suffix?: string
  sub?: string
  delta?: Delta
  deltaLabel?: string
  meter?: { value: number; tone: 'good' | 'warn' | 'crit' | 'brand' }
  note?: string
  index: number
}) {
  const v = useCountUp(props.value, 1100, props.decimals ?? 0)
  return (
    <div className="adm-tile adm-rise" style={{ '--i': props.index } as CSSProperties}>
      <small>{props.label}</small>
      <div className="adm-tile__value">
        {v.toLocaleString(undefined, { minimumFractionDigits: props.decimals ?? 0, maximumFractionDigits: props.decimals ?? 0 })}
        {props.suffix && <span>{props.suffix}</span>}
      </div>
      {props.meter && <Meter value={props.meter.value} tone={props.meter.tone} />}
      {props.delta && <DeltaChip d={props.delta} label={props.deltaLabel ?? ''} />}
      {props.sub && <p>{props.sub}</p>}
      {props.note && <p className="adm-tile__note">{props.note}</p>}
    </div>
  )
}

// ── Body ───────────────────────────────────────────────────────────────────────

function Body({ data, days, onViewRun }: { data: AnalyticsResult; days: number; onViewRun: (id: string) => void }) {
  const t = data.totals
  const prev = data.previous
  const ops = data.ops
  const vs = `vs previous ${days} days`

  const complianceRate = data.compliance.reviewedRuns ? Math.round((100 * data.compliance.compliantRuns) / data.compliance.reviewedRuns) : null
  const complianceTone = complianceRate == null ? 'brand' : complianceRate >= 90 ? 'good' : complianceRate >= 70 ? 'warn' : 'crit'
  const hotPct = Math.round((100 * data.pipeline.hot) / t.analysed)
  const signedPct = ops && ops.packsGenerated ? Math.round((100 * ops.packsReviewed) / ops.packsGenerated) : 0
  const hoursSaved = ops ? (ops.packsReviewed * MINUTES_SAVED_PER_PACK) / 60 : 0

  const funnel = useMemo(
    () => [
      { label: 'Conversations captured', value: t.conversations, note: 'Every voice session started in this period' },
      { label: 'Analysed live', value: t.analysed, note: 'Sessions that produced a transcript and live insights' },
      { label: 'Recommendation run', value: t.recommendations, note: 'Taken through the 11 AI agents' },
      { label: 'Advice pack drafted', value: ops?.packsGenerated ?? 0, note: 'Fact-find, record of advice, follow-up and CRM note built' },
      { label: 'Signed off by the advisor', value: ops?.packsReviewed ?? 0, note: 'Reviewed and confirmed by the advisor' },
    ],
    [t.conversations, t.analysed, t.recommendations, ops?.packsGenerated, ops?.packsReviewed],
  )

  const activity = data.activity ?? []
  const busiest = useMemo(() => {
    if (!activity.length) return null
    let best = 0
    activity.forEach((v, i) => { if (v > activity[best]) best = i })
    return activity[best] > 0 ? { day: WEEKDAYS[Math.floor(best / 24)], hour: best % 24, n: activity[best] } : null
  }, [activity])

  return (
    <>
      <div className="adm-tiles">
        <Tile index={0} label="Hot leads" value={data.pipeline.hot} sub={`${hotPct}% of conversations`} delta={prev ? delta(data.pipeline.hot, prev.hot) : undefined} deltaLabel={vs} />
        <Tile index={1} label="Average buying signal" value={t.avgBuyingSignal} decimals={1} suffix=" / 100" delta={prev && prev.analysed > 0 ? delta(t.avgBuyingSignal, prev.avgBuyingSignal) : undefined} deltaLabel={vs} />
        <Tile index={2} label="Recommendations run" value={t.recommendations} delta={prev ? delta(t.recommendations, prev.recommendations) : undefined} deltaLabel={vs} />
        {ops && ops.avgAnalysisSeconds > 0 && (
          <Tile index={3} label="Time to recommendation" value={ops.avgAnalysisSeconds} suffix=" s" sub={`Median ${Math.round(ops.medianAnalysisSeconds)} s · eleven agents, start to finish`} />
        )}
        {complianceRate != null && (
          <Tile index={4} label="Compliance pass rate" value={complianceRate} suffix="%" meter={{ value: complianceRate, tone: complianceTone }}
            sub={`${data.compliance.compliantRuns} of ${data.compliance.reviewedRuns} recommendations cleared`} />
        )}
        {ops && ops.packsGenerated > 0 && (
          <Tile index={5} label="Advice packs signed off" value={ops.packsReviewed} suffix={` / ${ops.packsGenerated}`} meter={{ value: signedPct, tone: 'brand' }}
            sub={ops.packsReviewed > 0 ? `About ${hoursSaved.toFixed(1)} hours of paperwork saved` : 'Sign off a pack to start counting time saved'} note={`Estimate: ${MINUTES_SAVED_PER_PACK} min of after-meeting admin per signed-off pack`} />
        )}
      </div>

      <div className="adm-grid12">
        <ChartCard className="span-8" title="Conversations per day" subtitle={days > 30 ? 'Latest 30 days of the period' : 'Analysed conversations, by day'}
          table={{ head: ['Date', 'Conversations'], rows: data.trend.map((d) => [shortDate(d.date), d.conversations]) }}>
          <TrendChart points={data.trend.map((d) => ({ x: d.date, y: d.conversations }))} unit="conversations" />
        </ChartCard>

        <ChartCard className="span-4" title="From conversation to sign-off" subtitle="How far each conversation travels"
          table={{ head: ['Stage', 'Count'], rows: funnel.map((f) => [f.label, f.value]) }}>
          <Funnel stages={funnel} />
        </ChartCard>

        <ChartCard className="span-8" title="Average buying signal" subtitle="Mean live buying signal of the conversations each day (0–100)"
          table={{ head: ['Date', 'Average buying signal'], rows: data.trend.filter((d) => d.conversations > 0).map((d) => [shortDate(d.date), d.avgBuyingSignal]) }}>
          <TrendChart points={data.trend.filter((d) => d.conversations > 0).map((d) => ({ x: d.date, y: d.avgBuyingSignal }))} unit="buying signal" yMax={100} decimals={1} height={190} />
        </ChartCard>

        <ChartCard className="span-4" title="Pipeline and sentiment" subtitle="How warm, and how positive"
          table={{
            head: ['Measure', 'Value', 'Count'],
            rows: [
              ['Buying signal', 'Hot (70+)', data.pipeline.hot], ['Buying signal', 'Warm (40–69)', data.pipeline.warm], ['Buying signal', 'Cold (<40)', data.pipeline.cold],
              ['Sentiment', 'Positive', data.sentiment.positive], ['Sentiment', 'Neutral', data.sentiment.neutral], ['Sentiment', 'Negative', data.sentiment.negative],
              ...(ops ? [['Captured', 'Live conversation', ops.liveCount], ['Captured', 'Dictated debrief', ops.debriefCount]] : []),
            ],
          }}>
          <div className="adm-stack">
            <div>
              <div className="adm-mini">Buying signal</div>
              <SplitBar unit="conversations" parts={[
                { label: 'Hot (70+)', value: data.pipeline.hot, color: 'var(--ord-5)' },
                { label: 'Warm (40–69)', value: data.pipeline.warm, color: 'var(--ord-3)' },
                { label: 'Cold (<40)', value: data.pipeline.cold, color: 'var(--ord-1)' },
              ]} />
            </div>
            <div>
              <div className="adm-mini">Customer sentiment</div>
              <SplitBar unit="conversations" parts={[
                { label: 'Negative', value: data.sentiment.negative, color: 'var(--neg)' },
                { label: 'Neutral', value: data.sentiment.neutral, color: 'var(--neu)' },
                { label: 'Positive', value: data.sentiment.positive, color: 'var(--pos)' },
              ]} />
            </div>
            {ops && (
              <div>
                <div className="adm-mini">How it was captured</div>
                <SplitBar unit="conversations" parts={[
                  { label: 'Live with the customer', value: ops.liveCount, color: 'var(--series)' },
                  { label: 'Dictated afterwards', value: ops.debriefCount, color: 'var(--neu)' },
                ]} />
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard className="span-6" title="Top customer needs" subtitle="Conversations in which each need was detected"
          table={{ head: ['Need', 'Conversations', 'Average strength'], rows: data.topNeeds.map((n) => [n.label, n.count, n.avgStrength]) }}>
          <HBarList rows={data.topNeeds.map((n) => ({ label: n.label, value: n.count, detail: `Average strength ${n.avgStrength}%` }))} unit="conversations" />
        </ChartCard>

        <ChartCard className="span-6" title="Most recommended products" subtitle="Appearances on a recommendation shortlist"
          table={{ head: ['Product', 'Shortlists'], rows: data.topProducts.map((p) => [p.label, p.count]) }}>
          <HBarList rows={data.topProducts.map((p) => ({ label: p.label, value: p.count }))} unit="shortlists" empty="Run recommendations to see which products are chosen most." />
        </ChartCard>

        {activity.length === 168 && (
          <ChartCard className="span-8" title="When conversations happen" subtitle={busiest ? `Busiest: ${busiest.day} ${String(busiest.hour).padStart(2, '0')}:00 (${busiest.n})` : 'By weekday and hour, Singapore time'}
            table={{
              head: ['Weekday', 'Hour', 'Conversations'],
              rows: activity.flatMap((v, i) => (v > 0 ? [[WEEKDAYS[Math.floor(i / 24)], `${String(i % 24).padStart(2, '0')}:00`, v]] : [])),
            }}>
            <Heatmap grid={activity} />
          </ChartCard>
        )}

        <ChartCard className="span-4" title="Compliance" subtitle="Live conduct flags and recommendation checks">
          <div className="adm-comp">
            <div className={`adm-comp__status adm-comp__status--${complianceTone}`}>
              <i aria-hidden>{complianceTone === 'good' ? '✓' : complianceTone === 'warn' ? '!' : complianceTone === 'crit' ? '✕' : '–'}</i>
              <div>
                <b>{complianceRate == null ? 'No recommendations checked yet' : `${complianceRate}% cleared`}</b>
                <span>{complianceRate == null ? '' : complianceTone === 'good' ? 'Strong' : complianceTone === 'warn' ? 'Worth watching' : 'Needs attention'}</span>
              </div>
            </div>
            {complianceRate != null && <Meter value={complianceRate} tone={complianceTone} />}
            <ul className="adm-comp__flags">
              <li className={data.compliance.highRiskFlags ? 'is-crit' : ''}><i aria-hidden>✕</i><span>High-risk statements</span><b>{data.compliance.highRiskFlags}</b></li>
              <li className={data.compliance.cautionFlags ? 'is-warn' : ''}><i aria-hidden>!</i><span>Caution flags</span><b>{data.compliance.cautionFlags}</b></li>
              <li><i aria-hidden>●</i><span>Conversations with a flag</span><b>{data.compliance.conversationsWithFlags}</b></li>
            </ul>
          </div>
        </ChartCard>

        <ChartCard className="span-7" title="Advisors" subtitle="Who is having the conversations"
          table={{ head: ['Advisor', 'Conversations', 'Avg buying signal', 'Hot leads', 'Flags'], rows: data.agents.map((a) => [shortName(a.agent), a.conversations, a.avgBuyingSignal, a.hotLeads, a.complianceFlags]) }}>
          <Leaderboard rows={data.agents} />
        </ChartCard>

        <ChartCard className="span-5" title="Leads to follow up" subtitle="Hottest buying signals first">
          <Leads leads={data.leadsToFollowUp} onViewRun={onViewRun} />
        </ChartCard>
      </div>
    </>
  )
}

function Leaderboard({ rows }: { rows: AnalyticsResult['agents'] }) {
  if (rows.length === 0) return <p className="adm-empty">No advisor activity in this period.</p>
  const max = Math.max(1, ...rows.map((r) => r.conversations))
  return (
    <ul className="adm-board">
      <li className="adm-board__head"><span>Advisor</span><span>Convos</span><span>Signal</span><span>Hot</span><span>Flags</span></li>
      {rows.map((r, i) => (
        <li key={r.agent} style={{ '--i': i } as CSSProperties}>
          <span className="adm-board__who"><i>{initials(shortName(r.agent))}</i><b>{shortName(r.agent)}</b></span>
          <span className="adm-board__bar"><span style={{ width: `${(100 * r.conversations) / max}%` }} /><b>{r.conversations}</b></span>
          <span>{r.avgBuyingSignal}</span>
          <span>{r.hotLeads}</span>
          <span className={r.complianceFlags ? 'has-flag' : ''}>{r.complianceFlags ? <><i aria-hidden>!</i>{r.complianceFlags}</> : '—'}</span>
        </li>
      ))}
    </ul>
  )
}

function Leads({ leads, onViewRun }: { leads: AnalyticsResult['leadsToFollowUp']; onViewRun: (id: string) => void }) {
  if (leads.length === 0) return <p className="adm-empty">No hot leads in this period.</p>
  return (
    <ul className="adm-leads">
      {leads.map((l, i) => (
        <li key={l.profileId} style={{ '--i': i } as CSSProperties}>
          <span className="adm-leads__avatar">{initials(l.customerName)}</span>
          <div className="adm-leads__main">
            <b>{l.customerName ?? 'Unnamed customer'}</b>
            <span>{l.topNeed ?? 'No clear need yet'} · {timeAgo(l.capturedAt)}</span>
          </div>
          <span className="adm-leads__signal" title="Buying signal">{l.buyingSignal}</span>
          {l.latestRunId && <button onClick={() => onViewRun(l.latestRunId!)}>Open</button>}
        </li>
      ))}
    </ul>
  )
}

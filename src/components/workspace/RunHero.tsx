import { AnimatePresence, motion } from 'framer-motion'
import type { AgentState } from '../../hooks/useRecommendationStream'
import type { AgentKey, ComplianceCheckResult, CustomerPersonaResult, CustomerProfile, ProductScoringResult, ProductShortlistResult } from '../../types'
import { AGENT_NAME } from '../../brand'

interface Props {
  runId: string | null
  steps: Record<AgentKey, AgentState>
  profile: CustomerProfile | null
  status: 'pending' | 'running' | 'complete' | 'failed'
  doneCount: number
  total: number
  /** Seconds the analysis has taken — only known for a run watched live. */
  elapsed: number | null
}

/** The first thing the room sees: who this is for, how far the analysis is, and the headline results as they land. */
export function RunHero({ runId, steps, profile, status, doneCount, total, elapsed }: Props) {
  const name = profile?.customerName
  const shortlist = steps.productShortlist.status === 'done' ? (steps.productShortlist.result as ProductShortlistResult) : null
  const scoring = steps.productScoring.status === 'done' ? (steps.productScoring.result as ProductScoringResult) : null
  const persona = steps.persona.status === 'done' ? (steps.persona.result as CustomerPersonaResult) : null
  const compliance = steps.complianceCheck.status === 'done' ? (steps.complianceCheck.result as ComplianceCheckResult) : null
  const top = shortlist?.shortlistedProducts?.[0]
  const topScore = top ? scoring?.scores.find((s) => s.productName.toLowerCase() === top.toLowerCase())?.score : undefined
  // A buying signal only means something when the customer was speaking; a dictated debrief has none worth showing.
  const buying = profile?.captureMode === 'DEBRIEF' ? undefined : profile?.liveInsights?.latest?.buyingSignal

  const pct = Math.round((100 * doneCount) / total)
  const R = 40
  const C = 2 * Math.PI * R

  return (
    <header className={`hero hero--${status}`}>
      <div className="hero__glow hero__glow--a" />
      <div className="hero__glow hero__glow--b" />
      <div className="hero__top">
        <div className="hero__who">
          <span className="hero__avatar">{(name ?? '?').charAt(0).toUpperCase()}</span>
          <div>
            <span className="hero__eyebrow">{AGENT_NAME} recommendation for</span>
            <h2>{name ?? 'the customer'}</h2>
            <p>
              {profile?.occupation ?? 'Customer'}
              {profile?.age ? ` · ${profile.age}` : ''}
              {runId ? ` · Run ${runId.slice(0, 8)}` : ''}
            </p>
          </div>
        </div>

        <div className="hero__ring" aria-label={`${doneCount} of ${total} agents complete`}>
          <svg viewBox="0 0 100 100">
            <circle className="hero__ring-track" cx="50" cy="50" r={R} />
            <motion.circle
              className="hero__ring-fill"
              cx="50" cy="50" r={R}
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - doneCount / total) }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </svg>
          <div className="hero__ring-text">
            <b>{status === 'complete' ? '✓' : `${pct}%`}</b>
            <small>{doneCount}/{total} agents</small>
          </div>
        </div>
      </div>

      <div className="hero__status">
        <span className={`hero__pill hero__pill--${status}`}>
          {status === 'complete' ? 'Analysis complete' : status === 'failed' ? 'Run failed' : status === 'running' ? `${AGENT_NAME} is analysing` : 'Starting'}
        </span>
        {elapsed != null && elapsed > 0 && <span className="hero__time">{status === 'complete' ? `Analysed in ${elapsed}s` : `${elapsed}s elapsed`}</span>}
      </div>

      <div className="hero__kpis">
        <AnimatePresence>
          {top && (
            <Kpi key="top" label="Top recommendation" value={top} sub={topScore != null ? `${topScore}% fit` : 'Shortlisted'} wide />
          )}
          {persona && <Kpi key="persona" label="Customer segment" value={persona.personaLabel} sub={persona.lifeStage} />}
          {buying && <Kpi key="buy" label="Buying signal" value={buying.level} sub={`${buying.score}/100 in the conversation`} />}
          {compliance && (
            <Kpi key="comp" label="Compliance" value={compliance.compliant ? 'Cleared' : 'Review needed'} sub={`${compliance.checks.filter((c) => c.passed).length}/${compliance.checks.length} checks passed`} tone={compliance.compliant ? 'ok' : 'warn'} />
          )}
        </AnimatePresence>
        {!top && !persona && !compliance && (
          <p className="hero__hint">Headline results appear here as each agent reports back.</p>
        )}
      </div>
    </header>
  )
}

function Kpi(props: { label: string; value: string; sub: string; wide?: boolean; tone?: 'ok' | 'warn' }) {
  return (
    <motion.div
      className={`hero__kpi${props.wide ? ' hero__kpi--wide' : ''}${props.tone ? ` is-${props.tone}` : ''}`}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
    >
      <small>{props.label}</small>
      <strong>{props.value}</strong>
      <span>{props.sub}</span>
    </motion.div>
  )
}

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { recommendationReportUrl } from '../../api/client'
import type { AgentState } from '../../hooks/useRecommendationStream'
import type {
  AffordabilityResult,
  AgentKey,
  ComplianceCheckResult,
  CustomerPersonaResult,
  MergedInsights,
  NeedAnalysisResult,
  ProductScoringResult,
  ProductShortlistResult,
  RagValidationResult,
  RecommendationSummaryResult,
  RiskAnalysisResult,
  SalesReportResult,
} from '../../types'
import { AGENT_META } from './agentMeta'
import { AgentIcon } from './agentIcons'
import { agentHeadline } from './agentHeadline'
import { CheckIcon, ChevronIcon, DownloadIcon, SpinnerIcon } from '../icons'

interface Props {
  agentKey: AgentKey
  state: AgentState
  index: number
  runId?: string | null
}

export function AgentCard({ agentKey, state, index, runId }: Props) {
  const [open, setOpen] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const meta = AGENT_META[agentKey]
  const headline = state.status === 'done' ? agentHeadline(agentKey, state.result) : null

  return (
    <motion.div
      className={`agent-card agent-card--${state.status}${open ? ' is-open' : ''}`}
      data-agent={agentKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="agent-card__inner">
        <button className="agent-card__header" onClick={() => setOpen((o) => !o)}>
          <span className="agent-card__icon"><AgentIcon agent={agentKey} /></span>
          <div className="agent-card__titles">
            <span className="agent-card__label">{meta.label}</span>
            <span className="agent-card__description">{meta.question}</span>
            {state.status === 'done' && headline && <span className="agent-card__headline">{headline}</span>}
            {state.status === 'running' && <span className="agent-card__headline agent-card__headline--busy">Working on it…</span>}
          </div>
          <StatusDot status={state.status} />
          <span className={`agent-card__chevron ${open ? 'is-open' : ''}`}>
            <ChevronIcon />
          </span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              className="agent-card__body-frame"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="agent-card__body">
                {state.status === 'idle' && <p className="agent-card__muted">Waiting to start&hellip;</p>}
                {state.status === 'running' && <p className="agent-card__muted">Analyzing&hellip;</p>}
                {state.status === 'failed' && <p className="agent-card__error">{state.error}</p>}
                {state.status === 'done' && state.result != null && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <AgentResultView agentKey={agentKey} result={state.result} runId={runId} />
                    <button className="agent-card__raw-toggle" onClick={() => setShowRaw((s) => !s)}>
                      {showRaw ? 'Hide raw output' : 'Show raw output'}
                    </button>
                    {showRaw && <pre className="agent-card__raw">{JSON.stringify(state.result, null, 2)}</pre>}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function StatusDot({ status }: { status: AgentState['status'] }) {
  if (status === 'done') {
    return (
      <motion.span
        className="agent-card__status-dot agent-card__status-dot--done"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <CheckIcon />
      </motion.span>
    )
  }
  if (status === 'running') {
    return (
      <span className="agent-card__status-dot agent-card__status-dot--running">
        <SpinnerIcon />
      </span>
    )
  }
  return <span className={`agent-card__status-dot agent-card__status-dot--${status}`} />
}

function AgentResultView({ agentKey, result, runId }: { agentKey: AgentKey; result: unknown; runId?: string | null }) {
  switch (agentKey) {
    case 'merge': {
      const r = result as MergedInsights
      return (
        <div className="agent-card__result">
          <p className="agent-card__rationale">{r.combinedNarrative}</p>
          <div className="merged-panel__grid">
            <div className="merged-panel__col">
              <h4>Needs</h4>
              <ul className="agent-card__list">
                {r.needs.protectionGaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
            <div className="merged-panel__col">
              <h4>
                Risks <span className="merged-panel__pill">{r.risks.riskLevel}</span>
              </h4>
              <ul className="agent-card__list">
                {r.risks.riskFactors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
            <div className="merged-panel__col">
              <h4>
                Affordability <span className="merged-panel__pill">{r.affordability.estimatedBudgetBand}</span>
              </h4>
              <p className="merged-panel__premium">{r.affordability.affordablePremiumRange}</p>
            </div>
          </div>
        </div>
      )
    }
    case 'need': {
      const r = result as NeedAnalysisResult
      return (
        <div className="agent-card__result">
          {r.protectionGaps.length > 0 && <Section title="Protection gaps" items={r.protectionGaps} />}
          {r.recommendedCategories.length > 0 && (
            <div className="profile-card__tags">
              {r.recommendedCategories.map((c, i) => (
                <span className="profile-card__tag" key={i}>
                  {c}
                </span>
              ))}
            </div>
          )}
          <p className="agent-card__rationale">{r.rationale}</p>
        </div>
      )
    }
    case 'risk': {
      const r = result as RiskAnalysisResult
      return (
        <div className="agent-card__result">
          <span className="merged-panel__pill">{r.riskLevel} risk</span>
          {r.riskFactors.length > 0 && <Section title="Risk factors" items={r.riskFactors} />}
          <p className="agent-card__rationale">{r.rationale}</p>
        </div>
      )
    }
    case 'affordability': {
      const r = result as AffordabilityResult
      return (
        <div className="agent-card__result">
          <span className="merged-panel__pill">{r.estimatedBudgetBand}</span>
          <p className="agent-card__premium">{r.affordablePremiumRange}</p>
          <p className="agent-card__rationale">{r.rationale}</p>
        </div>
      )
    }
    case 'persona': {
      const r = result as CustomerPersonaResult
      return (
        <div className="agent-card__result">
          <span className="merged-panel__pill">{r.lifeStage}</span>
          <p className="agent-card__premium">{r.personaLabel}</p>
          {r.characteristics.length > 0 && <Section title="Characteristics" items={r.characteristics} />}
          <p className="agent-card__rationale">{r.rationale}</p>
        </div>
      )
    }
    case 'productScoring': {
      const r = result as ProductScoringResult
      return (
        <div className="agent-card__result">
          <ul className="agent-card__list">
            {[...r.scores]
              .sort((a, b) => b.score - a.score)
              .map((s, i) => (
                <li key={i}>
                  <strong>{s.productName}</strong> — {s.score}/100
                  {s.matchReasons.length > 0 && (
                    <ul className="agent-card__list">
                      {s.matchReasons.map((m, j) => (
                        <li key={j}>{m}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
          </ul>
          <p className="agent-card__rationale">{r.methodology}</p>
        </div>
      )
    }
    case 'productShortlist': {
      const r = result as ProductShortlistResult
      return (
        <div className="agent-card__result">
          <div className="profile-card__tags">
            {r.shortlistedProducts.map((p, i) => (
              <span className="profile-card__tag" key={i}>
                {p}
              </span>
            ))}
          </div>
          <p className="agent-card__rationale">{r.rationale}</p>
        </div>
      )
    }
    case 'ragValidation': {
      const r = result as RagValidationResult
      return (
        <div className="agent-card__result">
          <span className={`merged-panel__pill ${r.allClaimsSupported ? 'merged-panel__pill--good' : 'merged-panel__pill--warn'}`}>
            {r.allClaimsSupported ? 'Evidence-validated' : 'Needs review'}
          </span>
          <ul className="agent-card__list">
            {r.citations.map((c, i) => (
              <li key={i}>
                <strong>
                  {c.productName} — {c.docCategory}
                </strong>{' '}
                ({c.sourceFile}): {c.excerpt}
              </li>
            ))}
          </ul>
          <p className="agent-card__rationale">{r.notes}</p>
        </div>
      )
    }
    case 'summary': {
      const r = result as RecommendationSummaryResult
      return (
        <div className="agent-card__result">
          <p className="agent-card__rationale">{r.customerFacingSummary}</p>
          {r.keyTalkingPoints.length > 0 && <Section title="Talking points" items={r.keyTalkingPoints} />}
        </div>
      )
    }
    case 'complianceCheck': {
      const r = result as ComplianceCheckResult
      return (
        <div className="agent-card__result">
          <span className={`merged-panel__pill ${r.compliant ? 'merged-panel__pill--good' : 'merged-panel__pill--warn'}`}>
            {r.compliant ? 'Compliant' : 'Requires review'}
          </span>
          <ul className="agent-card__list">
            {r.checks.map((c, i) => (
              <li key={i}>
                {c.passed ? '✓' : '✗'} <strong>{c.check}</strong> — {c.note}
              </li>
            ))}
          </ul>
          {r.issues.length > 0 && <Section title="Issues to resolve" items={r.issues} />}
          <p className="agent-card__rationale">{r.rationale}</p>
        </div>
      )
    }
    case 'salesReport': {
      const r = result as SalesReportResult
      return (
        <div className="agent-card__result">
          <p className="agent-card__premium">{r.title}</p>
          <p className="agent-card__rationale agent-card__rationale--report">{reportPreview(r.reportMarkdown)}</p>
          {runId && (
            <a className="agent-card__download-btn" href={recommendationReportUrl(runId)} download>
              <DownloadIcon /> Download full report
            </a>
          )}
        </div>
      )
    }
    default:
      return null
  }
}

/** Leads with the recommended products — the part of the report the reader actually wants — rather than the header. */
function reportPreview(md: string): string {
  const m = md.match(/## Recommended Products\n([\s\S]*?)(?=\n## |$)/)
  const text = (m ? m[1] : md).replace(/\*\*/g, '').replace(/\*/g, '').trim()
  return text.length > 420 ? `${text.slice(0, 420)}…` : text
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="agent-card__section">
      <span className="agent-card__section-label">{title}</span>
      <ul className="agent-card__list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

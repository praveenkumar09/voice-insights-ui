import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { recommendationReportUrl } from '../../api/client'
import type { AgentState } from '../../hooks/useRecommendationStream'
import { PIPELINE_ORDER } from '../../hooks/useRecommendationStream'
import type { AgentKey, CustomerProfile, SalesReportResult } from '../../types'
import { DownloadIcon } from '../icons'
import { GoalsPlan } from '../future/GoalsPlan'
import { LiveVsFinal } from '../orchestration/LiveVsFinal'
import { OrchestratorCanvas } from '../orchestration/OrchestratorCanvas'
import { ProposalPanel } from '../proposal/ProposalPanel'
import { MarkdownLite } from '../report/MarkdownLite'

type Tab = 'live' | 'agents' | 'report' | 'future'
type ReportView = 'advisory' | 'proposal'

interface Props {
  runId: string | null
  steps: Record<AgentKey, AgentState>
  profile: CustomerProfile | null
  /** 'report' for a finished run opened from admin; 'agents' for a run the user just started and wants to watch. */
  initialTab: Tab
  runFailed?: string | null
}

/**
 * The recommendation page, organised as three deliberate stages instead of one
 * long scroll: (1) Live vs final analysis — what the copilot thought during the
 * call versus what the agents concluded; (2) Agent orchestration — the pipeline
 * itself; (3) Final report — the report agent's advisory report and the
 * customer proposal. A fresh run opens on the pipeline so you can watch it
 * work, then moves to the report when it lands.
 */
export function RunWorkspace({ runId, steps, profile, initialTab, runFailed }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [reportView, setReportView] = useState<ReportView>('advisory')
  const userPicked = useRef(false)

  const doneCount = PIPELINE_ORDER.filter((k) => steps[k].status === 'done').length
  const total = PIPELINE_ORDER.length
  const reportReady = steps.salesReport.status === 'done'
  const report = reportReady ? (steps.salesReport.result as SalesReportResult) : null
  const finalReady = steps.merge.status === 'done' || steps.productShortlist.status === 'done'
  const running = !reportReady && !runFailed && PIPELINE_ORDER.some((k) => steps[k].status === 'running')
  const failedAgent = PIPELINE_ORDER.find((k) => steps[k].status === 'failed')

  // When a watched run finishes, bring the user to the outcome — unless they've already chosen where to look.
  useEffect(() => {
    if (!reportReady || userPicked.current || initialTab !== 'agents') return
    const t = setTimeout(() => !userPicked.current && setTab('report'), 1400)
    return () => clearTimeout(t)
  }, [reportReady, initialTab])

  function pick(next: Tab) {
    userPicked.current = true
    setTab(next)
  }

  const status = runFailed ? 'failed' : reportReady ? 'complete' : running || doneCount > 0 ? 'running' : 'pending'
  const name = profile?.customerName

  return (
    <div className="ws">
      <header className="glass-card ws__summary">
        <div className="ws__who">
          <span className="ws__avatar">{(name ?? '?').charAt(0).toUpperCase()}</span>
          <div>
            <h2>Recommendation for {name ?? 'the customer'}</h2>
            <p>
              {profile?.occupation ? `${profile.occupation} · ` : ''}
              {runId ? `Run ${runId.slice(0, 8)}` : 'Starting run…'}
            </p>
          </div>
        </div>
        <div className="ws__progress">
          <div className="ws__progress-top">
            <span className={`ws__status ws__status--${status}`}>
              {status === 'complete' ? '✓ Complete' : status === 'failed' ? 'Failed' : status === 'running' ? 'Analysing' : 'Starting'}
            </span>
            <span className="ws__count">
              {doneCount} / {total} agents
            </span>
          </div>
          <div className="ws__bar">
            <motion.span animate={{ width: `${(100 * doneCount) / total}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
          </div>
        </div>
      </header>

      {(runFailed || failedAgent) && (
        <p className="orchestration-screen__error">
          {runFailed ? `Run failed: ${runFailed}` : `The ${failedAgent} agent failed — see the Agent orchestration tab for details.`}
        </p>
      )}

      <nav className="ws__tabs" role="tablist" aria-label="Recommendation stages">
        <TabButton n={1} active={tab === 'live'} onClick={() => pick('live')} title="Live vs final analysis" hint="Copilot vs agents"
          chip={finalReady ? 'Compare' : 'Waiting'} chipState={finalReady ? 'ok' : 'idle'} />
        <TabButton n={2} active={tab === 'agents'} onClick={() => pick('agents')} title="Agent orchestration" hint="The 11-agent pipeline"
          chip={`${doneCount}/${total}`} chipState={reportReady ? 'ok' : running ? 'busy' : 'idle'} />
        <TabButton n={3} active={tab === 'report'} onClick={() => pick('report')} title="Final report" hint="Advisory report & proposal"
          chip={reportReady ? 'Ready' : 'Pending'} chipState={reportReady ? 'ok' : 'idle'} pulse={reportReady && tab !== 'report'} />
        <TabButton n={4} active={tab === 'future'} onClick={() => pick('future')} title="Goals & plan" hint="What matters to them, and how we help"
          chip={reportReady ? 'New' : 'Pending'} chipState={reportReady ? 'accent' : 'idle'} />
      </nav>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
          {tab === 'live' && <LiveStage profile={profile} steps={steps} finalReady={finalReady} />}

          {tab === 'agents' && <OrchestratorCanvas runId={runId} steps={steps} />}

          {tab === 'future' &&
            (report && runId ? (
              <GoalsPlan runId={runId} report={report} customerName={name} />
            ) : (
              <div className="glass-card ws__waiting">
                <span className="proposal__spinner" />
                <div>
                  <strong>The Goals and plan view is prepared with the report</strong>
                  <p>It appears here as soon as the report agent finishes.</p>
                </div>
              </div>
            ))}

          {tab === 'report' && (
            <div className="ws__report">
              {!report ? (
                <div className="glass-card ws__waiting">
                  <span className="proposal__spinner" />
                  <div>
                    <strong>The report agent hasn’t finished yet</strong>
                    <p>{doneCount} of {total} agents complete. The advisory report and customer proposal appear here automatically.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="ws__report-bar">
                    <div className="ws__seg" role="tablist" aria-label="Report view">
                      <button role="tab" aria-selected={reportView === 'advisory'} className={reportView === 'advisory' ? 'is-active' : ''} onClick={() => setReportView('advisory')}>
                        Advisory report
                      </button>
                      <button role="tab" aria-selected={reportView === 'proposal'} className={reportView === 'proposal' ? 'is-active' : ''} onClick={() => setReportView('proposal')}>
                        Customer proposal
                      </button>
                    </div>
                    {reportView === 'advisory' && runId && (
                      <a className="ghost-btn ws__download" href={recommendationReportUrl(runId)} download>
                        <DownloadIcon /> Download report
                      </a>
                    )}
                  </div>

                  {reportView === 'advisory' && (
                    <div className="glass-card ws__doc">
                      <div className="glass-card__label">
                        Advisory sales report <span className="live-tag">For the advisor · internal</span>
                      </div>
                      <MarkdownLite source={report.reportMarkdown} />
                    </div>
                  )}
                  {reportView === 'proposal' && runId && <ProposalPanel runId={runId} report={report} customerName={name} />}
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function LiveStage({ profile, steps, finalReady }: { profile: CustomerProfile | null; steps: Record<AgentKey, AgentState>; finalReady: boolean }) {
  const live = profile?.liveInsights ?? null
  if (!live?.latest) {
    return (
      <div className="glass-card ws__waiting">
        <div>
          <strong>No live analysis was captured for this conversation</strong>
          <p>Live insights are recorded while the customer is speaking on the Home page.</p>
        </div>
      </div>
    )
  }
  if (!finalReady) {
    return (
      <div className="glass-card ws__waiting">
        <span className="proposal__spinner" />
        <div>
          <strong>Waiting for the agents’ final analysis</strong>
          <p>The comparison appears as soon as the need and product agents finish — open Agent orchestration to watch them work.</p>
        </div>
      </div>
    )
  }
  return <LiveVsFinal live={live} steps={steps} />
}

function TabButton(props: {
  n: number
  active: boolean
  onClick: () => void
  title: string
  hint: string
  chip: string
  chipState: 'ok' | 'busy' | 'idle' | 'accent'
  pulse?: boolean
}) {
  return (
    <button role="tab" aria-selected={props.active} className={`ws__tab${props.active ? ' is-active' : ''}${props.pulse ? ' is-pulse' : ''}`} onClick={props.onClick}>
      <span className="ws__tab-n">{props.n}</span>
      <span className="ws__tab-text">
        <strong>{props.title}</strong>
        <small>{props.hint}</small>
      </span>
      <span className={`ws__chip ws__chip--${props.chipState}`}>{props.chip}</span>
    </button>
  )
}

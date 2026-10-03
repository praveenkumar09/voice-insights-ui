import { useEffect, useRef, useState } from 'react'
import { recommendationReportUrl } from '../../api/client'
import type { AgentState } from '../../hooks/useRecommendationStream'
import { PIPELINE_ORDER } from '../../hooks/useRecommendationStream'
import type { AgentKey, CustomerProfile, SalesReportResult } from '../../types'
import { AdvicePackPanel } from '../advicepack/AdvicePackPanel'
import { DownloadIcon } from '../icons'
import { GoalsPlan } from '../future/GoalsPlan'
import { LiveVsFinal } from '../orchestration/LiveVsFinal'
import { OrchestratorCanvas } from '../orchestration/OrchestratorCanvas'
import { ProposalPanel } from '../proposal/ProposalPanel'
import { MarkdownLite } from '../report/MarkdownLite'
import { JourneyNav, type JourneyId, type JourneyStep } from './JourneyNav'
import { ReportSpotlight } from './ReportSpotlight'
import { RunHero } from './RunHero'
import { StageIntro } from './StageIntro'
import { AGENT_NAME } from '../../brand'

type Tab = JourneyId
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
 * The recommendation page, as a five-stage journey: (1) Agent orchestration — the pipeline doing its work;
 * (2) Live vs final — what the copilot thought during the call set against what those agents concluded (so it
 * can only follow the pipeline); (3) Final report — the advisory report and the customer proposal;
 * (4) Goals & plan — the warm customer conversation page; (5) Advice pack — the advisor's after-meeting admin.
 * A hero up top carries the customer and the headline results as they land.
 */
export function RunWorkspace({ runId, steps, profile, initialTab, runFailed }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [reportView, setReportView] = useState<ReportView>('advisory')
  const userPicked = useRef(false)
  const watched = initialTab === 'agents'
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  const doneCount = PIPELINE_ORDER.filter((k) => steps[k].status === 'done').length
  const total = PIPELINE_ORDER.length
  const reportReady = steps.salesReport.status === 'done'
  const report = reportReady ? (steps.salesReport.result as SalesReportResult) : null
  const finalReady = steps.merge.status === 'done' || steps.productShortlist.status === 'done'
  const running = !reportReady && !runFailed && PIPELINE_ORDER.some((k) => steps[k].status === 'running')
  const failedAgent = PIPELINE_ORDER.find((k) => steps[k].status === 'failed')

  // Time to insight, for a run being watched live.
  useEffect(() => {
    if (!watched || reportReady) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [watched, reportReady])
  useEffect(() => {
    if (watched && reportReady) setElapsed(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))
  }, [watched, reportReady])

  // When a watched run finishes, move on to the next stage — unless they've already chosen where to look.
  useEffect(() => {
    if (!reportReady || userPicked.current || initialTab !== 'agents') return
    const t = setTimeout(() => !userPicked.current && setTab(profile?.liveInsights?.latest ? 'live' : 'report'), 1600)
    return () => clearTimeout(t)
  }, [reportReady, initialTab, profile?.liveInsights?.latest])

  function pick(next: Tab) {
    userPicked.current = true
    setTab(next)
  }

  const status = runFailed ? 'failed' : reportReady ? 'complete' : running || doneCount > 0 ? 'running' : 'pending'
  const name = profile?.customerName

  const journey: JourneyStep[] = [
    { id: 'agents', title: AGENT_NAME, hint: 'Agent orchestration · 11 agents', state: reportReady ? 'done' : running || doneCount > 0 ? 'running' : 'idle', chip: reportReady ? 'Complete' : `${doneCount}/${total}` },
    { id: 'live', title: 'Live vs final', hint: 'Copilot vs the agents', state: finalReady ? 'done' : 'idle', chip: finalReady ? 'Compare' : 'Waiting' },
    { id: 'report', title: 'Final report', hint: 'Advisory report & proposal', state: reportReady ? 'done' : 'idle', chip: reportReady ? 'Ready' : 'Pending' },
    { id: 'future', title: 'Goals & plan', hint: 'Customer conversation page', state: reportReady ? 'new' : 'idle', chip: reportReady ? 'Ready' : 'Pending' },
    { id: 'advice', title: 'Advice pack', hint: 'After-meeting admin, done', state: reportReady ? 'new' : 'idle', chip: reportReady ? 'Ready' : 'Pending' },
  ]

  return (
    <div className="ws">
      <RunHero runId={runId} steps={steps} profile={profile} status={status} doneCount={doneCount} total={total} elapsed={watched ? elapsed : null} />

      {(runFailed || failedAgent) && (
        <p className="orchestration-screen__error">
          {runFailed ? `Run failed: ${runFailed}` : `The ${failedAgent} agent failed — see the ${AGENT_NAME} stage for details.`}
        </p>
      )}

      <JourneyNav steps={journey} active={tab} onPick={pick} />

      {/* No exit animation: the next stage must never wait on the previous one finishing, or a throttled window looks frozen. */}
      <div key={tab} className="ws__stage ws__stage--in">
        <div>
          {tab === 'agents' && (
            <>
              <StageIntro title={`Meet ${AGENT_NAME}`} text={`${AGENT_NAME} is the orchestration behind every recommendation: eleven specialist AI agents analyse the conversation in four phases. Every card shows its one-line conclusion — open it for the full reasoning.`} audience={[{ label: 'Behind the scenes', kind: 'internal' }]} />
              <OrchestratorCanvas runId={runId} steps={steps} />
            </>
          )}

          {tab === 'live' && (
            <>
              <StageIntro title="Live vs final analysis" text="What the copilot suggested during the conversation, set against what the full agent analysis concluded. The agents’ answer is the recommendation of record." audience={[{ label: 'For the advisor · internal', kind: 'internal' }]} />
              <LiveStage profile={profile} steps={steps} finalReady={finalReady} />
            </>
          )}

          {tab === 'future' && (
            <>
              <StageIntro title="Goals & plan" text="A warm, positive page to talk through with the customer: what matters to them, in their own words, and how the recommendation helps with each goal." audience={[{ label: 'Customer-facing · for the conversation', kind: 'customer' }]} />
              {report && runId ? (
                <GoalsPlan runId={runId} report={report} customerName={name} />
              ) : (
                <div className="glass-card ws__waiting">
                  <span className="proposal__spinner" />
                  <div>
                    <strong>The Goals and plan view is prepared with the report</strong>
                    <p>It appears here as soon as the report agent finishes.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'advice' && (
            <>
              <StageIntro title="Advice pack" text="The paperwork an advisor normally does after a meeting — fact-find, record of advice, follow-up message, CRM note and next-meeting brief — drafted for review and sign-off." audience={[{ label: 'For the advisor · internal', kind: 'internal' }]} />
              {runId && <AdvicePackPanel runId={runId} customerName={name} ready={reportReady} />}
            </>
          )}

          {tab === 'report' && (
            <div className="ws__report">
              <StageIntro title="Two documents from one analysis" text="The advisory report is the advisor’s own briefing. The customer proposal is the take-home version, in the customer’s language, with its own compliance check." audience={[{ label: 'Advisory report · internal', kind: 'internal' }, { label: 'Customer proposal · customer-facing', kind: 'customer' }]} />
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
                  <ReportSpotlight steps={steps} />
                  <div className="ws__report-bar">
                    <div className="ws__seg ws__seg--docs" role="tablist" aria-label="Report view">
                      <button role="tab" aria-selected={reportView === 'advisory'} className={reportView === 'advisory' ? 'is-active' : ''} onClick={() => setReportView('advisory')}>
                        Advisory report <small>Internal</small>
                      </button>
                      <button role="tab" aria-selected={reportView === 'proposal'} className={reportView === 'proposal' ? 'is-active' : ''} onClick={() => setReportView('proposal')}>
                        Customer proposal <small>Customer-facing</small>
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
        </div>
      </div>
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
          <p>The comparison appears as soon as the need and product agents finish — open {AGENT_NAME} to watch them work.</p>
        </div>
      </div>
    )
  }
  return <LiveVsFinal live={live} steps={steps} showBuying={profile?.captureMode !== 'DEBRIEF'} />
}

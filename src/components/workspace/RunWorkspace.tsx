import { useEffect, useRef, useState } from 'react'
import type { AgentState } from '../../hooks/useRecommendationStream'
import { PIPELINE_ORDER } from '../../hooks/useRecommendationStream'
import type { AgentKey, CustomerProfile, ProductShortlistResult, SalesReportResult } from '../../types'
import { AdvicePackPanel } from '../advicepack/AdvicePackPanel'
import { AskJuno } from '../ask/AskJuno'
import { GoalsPlan } from '../future/GoalsPlan'
import { OrchestratorCanvas } from '../orchestration/OrchestratorCanvas'
import { ProposalPanel } from '../proposal/ProposalPanel'
import { HowJunoDecidedContent, HowJunoDecidedDrawer, type HowView } from './HowJunoDecided'
import type { Part as PackPart } from '../advicepack/AdvicePackPanel'
import { JourneyNav, type JourneyId, type JourneyStep } from './JourneyNav'
import { ReportSpotlight } from './ReportSpotlight'
import { RunHero } from './RunHero'
import { StageIntro } from './StageIntro'
import { AGENT_NAME } from '../../brand'
import { useJunoAction, useJunoAnnounce, useJunoScreen } from '../juno/mode/JunoMode'
import { rememberRun } from '../../utils/lastRun'

type Tab = JourneyId
type CustomerView = 'goals' | 'proposal'

interface Props {
  runId: string | null
  steps: Record<AgentKey, AgentState>
  profile: CustomerProfile | null
  /** A run the advisor just started and is watching (the hero shows the clock). A run opened from Admin is already finished. */
  watch?: boolean
  runFailed?: string | null
}

/**
 * The suggestion page, in four places instead of five stages and a dozen panels. Each thing lives in exactly one of them:
 *  - Suggestion: the answer (the ranked products and why), with the agents' progress while it lands, and "ask Juno why" beneath it.
 *  - With the customer: the customer-facing pages — Goals & plan and the take-home proposal.
 *  - After the meeting: the advice pack (fact-find, record of advice, follow-up, CRM, next meeting).
 *  - Behind the scenes: how the agents decided, live vs final (only when there was a live conversation) and the full advisory report.
 * The page opens on Suggestion and stays there when the analysis finishes: it never moves the advisor on by itself.
 */
export function RunWorkspace({ runId, steps, profile, watch = false, runFailed }: Props) {
  const [tab, setTab] = useState<Tab>('suggestion')
  const [customerView, setCustomerView] = useState<CustomerView>('goals')
  const [howView, setHowView] = useState<HowView>('agents')
  const [howOpen, setHowOpen] = useState(false)
  const [packPart, setPackPart] = useState<PackPart>('factFind')
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const announce = useJunoAnnounce()
  const announced = useRef(false)

  const doneCount = PIPELINE_ORDER.filter((k) => steps[k].status === 'done').length
  const total = PIPELINE_ORDER.length
  const reportReady = steps.salesReport.status === 'done'
  const report = reportReady ? (steps.salesReport.result as SalesReportResult) : null
  const finalReady = steps.merge.status === 'done' || steps.productShortlist.status === 'done'
  const running = !reportReady && !runFailed && PIPELINE_ORDER.some((k) => steps[k].status === 'running')
  const failedAgent = PIPELINE_ORDER.find((k) => steps[k].status === 'failed')
  const live = profile?.liveInsights ?? null
  const hasLive = !!live?.latest
  const shortlist = steps.productShortlist.status === 'done' ? (steps.productShortlist.result as ProductShortlistResult) : null
  const name = profile?.customerName

  // Time to insight, for a run being watched live.
  useEffect(() => {
    if (!watch || reportReady) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [watch, reportReady])
  useEffect(() => {
    if (watch && reportReady) setElapsed(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))
  }, [watch, reportReady])

  // Hands-free: with Juno mode on, say that the suggestion is ready (once, only for a run that was being watched).
  useEffect(() => {
    if (!watch || !reportReady || announced.current) return
    announced.current = true
    const top = shortlist?.shortlistedProducts?.[0]
    announce(`${name ? `The suggestion for ${name} is ready. ` : 'The suggestion is ready. '}${top ? `The top suggestion is ${top}. ` : ''}Say “open the advice pack”, “read the report” or “ask why”.`)
  }, [watch, reportReady, shortlist, name, announce])

  useEffect(() => { if (runId && reportReady) rememberRun(runId, name) }, [runId, reportReady, name])

  const status = runFailed ? 'failed' : reportReady ? 'complete' : running || doneCount > 0 ? 'running' : 'pending'

  // What Juno can open. The names stay as plain as what the advisor would say; each lands on one tab (and one view inside it).
  const openHow = (v: HowView = 'agents') => { setHowView(v); setHowOpen(true) }
  const STAGES: Record<string, () => void> = {
    suggestion: () => { setHowOpen(false); setTab('suggestion') },
    goals_and_plan: () => { setHowOpen(false); setCustomerView('goals'); setTab('customer') },
    customer_proposal: () => { setHowOpen(false); setCustomerView('proposal'); setTab('customer') },
    advice_pack: () => { setHowOpen(false); setTab('after') },
    advisory_report: () => { setHowOpen(false); setPackPart('report'); setTab('after') },
    analysis: () => openHow('agents'),
    agents: () => openHow('agents'),
    ...(hasLive ? { live_vs_final: () => openHow('live') } : {}),
  }
  const TAB_LABEL: Record<Tab, string> = { suggestion: 'Suggestion', customer: 'Proposal', after: 'Advice Pack' }
  useJunoScreen(`The suggestion workspace${name ? ` for ${name}` : ''}, ${howOpen ? `the How ${AGENT_NAME} decided side panel` : `${TAB_LABEL[tab]} tab`}`)
  useJunoAction({
    id: 'open_stage', description: 'Open Suggestion, Goals and plan, Customer proposal, Advice pack, Advisory report, or how Juno decided (Analysis, Agents' + (hasLive ? ', Live vs final' : '') + ')', risk: 'open',
    params: { stage: { type: 'enum', values: Object.keys(STAGES) } },
    run: (p) => { STAGES[p.stage]?.() },
  })

  const journey: JourneyStep[] = [
    { id: 'suggestion', title: 'Suggestion', hint: 'The answer, and why', state: reportReady ? 'done' : running || doneCount > 0 ? 'running' : 'idle', chip: reportReady ? 'Ready' : `${doneCount}/${total}` },
    { id: 'customer', title: 'Proposal', hint: 'Goals & plan, and the customer proposal', state: reportReady ? 'new' : 'idle', chip: reportReady ? 'Ready' : 'Pending' },
    { id: 'after', title: 'Advice Pack', hint: 'Follow-up, CRM, fact-find, record of advice, report', state: reportReady ? 'new' : 'idle', chip: reportReady ? 'Ready' : 'Pending' },
  ]

  // The full analysis can put a different product first than the live conversation did: say so, in one line.
  const liveTop = live?.latest?.productMatches?.[0]?.productName
  const finalTop = shortlist?.shortlistedProducts?.[0]
  const changedSinceLive = hasLive && finalReady && !!liveTop && !!finalTop && liveTop.toLowerCase() !== finalTop.toLowerCase()

  const waiting = (title: string, text: string) => (
    <div className="glass-card ws__waiting">
      <span className="proposal__spinner" />
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  )

  return (
    <div className="ws">
      <RunHero reportReady={reportReady} runId={runId} steps={steps} profile={profile} status={status} doneCount={doneCount} total={total} elapsed={watch ? elapsed : null} onOpenHow={() => openHow('agents')} />

      {(runFailed || failedAgent) && (
        <p className="orchestration-screen__error">
          {runFailed ? `Run failed: ${runFailed}` : `The ${failedAgent} agent failed — see the agents’ details for more.`}
        </p>
      )}

      <JourneyNav steps={journey} active={tab} onPick={setTab} />

      {/* No exit animation: the next stage must never wait on the previous one finishing, or a throttled window looks frozen. */}
      <div key={tab} className="ws__stage ws__stage--in">
        <div>
          {tab === 'suggestion' && (
            <div className="ws__report">
              <ReportSpotlight steps={steps} onOpenHow={() => openHow('agents')} />
              {!reportReady && (
                <>
                  <StageIntro title={`${AGENT_NAME} is working it out`} text={`${doneCount} of ${total} specialist agents done. The suggestion above fills in as they report back; the rest is ready when they finish.`} audience={[]} />
                  <OrchestratorCanvas runId={runId} steps={steps} />
                </>
              )}
              {reportReady && (
                <>
                  {changedSinceLive && (
                    <div className="ws__changed" role="note">
                      <span aria-hidden>⚠</span>
                      <div><b>One change since the live conversation.</b> Juno first leaned towards {liveTop}; after the full analysis {finalTop} came out on top. <button type="button" onClick={() => openHow('live')}>See the comparison</button></div>
                    </div>
                  )}
                  {runId && <AskJuno runId={runId} customerName={name} />}
                </>
              )}
            </div>
          )}

          {tab === 'customer' && (
            <>
              <StageIntro title="Proposal" text="What matters to them and how the suggestion helps, then the proposal to take home." audience={[{ label: 'Customer-facing', kind: 'customer' }]} />
              {!report || !runId ? waiting('Prepared with the report', `${doneCount} of ${total} agents complete. It appears here as soon as the report agent finishes.`) : (
                <>
                  <div className="ws__report-bar">
                    <div className="ws__seg ws__seg--docs" role="tablist" aria-label="Customer pages">
                      <button role="tab" aria-selected={customerView === 'goals'} className={customerView === 'goals' ? 'is-active' : ''} onClick={() => setCustomerView('goals')}>Goals &amp; plan</button>
                      <button role="tab" aria-selected={customerView === 'proposal'} className={customerView === 'proposal' ? 'is-active' : ''} onClick={() => setCustomerView('proposal')}>Customer proposal</button>
                    </div>
                  </div>
                  {customerView === 'goals' ? <GoalsPlan runId={runId} report={report} customerName={name} /> : <ProposalPanel runId={runId} report={report} customerName={name} />}
                </>
              )}
            </>
          )}

          {tab === 'after' && (
            <>
              <StageIntro title="Advice Pack" text="The after-meeting paperwork, drafted. Check it, edit it, sign it off." audience={[{ label: 'For the advisor · internal', kind: 'internal' }]} />
              {runId && <AdvicePackPanel runId={runId} customerName={name} profileId={profile?.id ?? null} reportMarkdown={report?.reportMarkdown ?? null} part={packPart} onPartChange={setPackPart} ready={reportReady} />}
            </>
          )}

        </div>
      </div>

      {(
        <HowJunoDecidedDrawer open={howOpen} onClose={() => setHowOpen(false)}>
          <HowJunoDecidedContent runId={runId} steps={steps} profile={profile} hasLive={hasLive} finalReady={finalReady} view={howView} onView={setHowView} />
        </HowJunoDecidedDrawer>
      )}
    </div>
  )
}

import type { AgentState } from '../../hooks/useRecommendationStream'
import type { AgentKey } from '../../types'
import { PARALLEL_AGENTS, POST_MERGE_AGENTS } from './agentMeta'
import { AgentCard } from './AgentCard'
import { ConnectorLine } from './ConnectorLine'
import { OrchestratorNode } from './OrchestratorNode'
import { SequentialConnector } from './SequentialConnector'

interface Props {
  runId?: string | null
  steps: Record<AgentKey, AgentState>
}

/**
 * One continuous graph, top to bottom: Orchestrator fans out to the three
 * parallel analysis agents, which converge into a single chain — merge,
 * persona, product scoring, shortlist, RAG validation, compliance, summary,
 * sales report — rendered as the same AgentCard used everywhere else, so
 * there's no visual seam between "the parallel part" and "the rest of the
 * pipeline." Every step, including merge, is collapsed by default and only
 * shows its full output on click, so nothing pre-empts the sales report at
 * the end of the chain.
 */
export function OrchestratorCanvas({ runId, steps }: Props) {
  const active = PARALLEL_AGENTS.map((k) => steps[k].status === 'running' || steps[k].status === 'done') as [
    boolean,
    boolean,
    boolean,
  ]
  const done = PARALLEL_AGENTS.map((k) => steps[k].status === 'done') as [boolean, boolean, boolean]
  const anyStarted = active.some(Boolean)
  const allParallelDone = done.every(Boolean)
  const fanInStatus = allParallelDone ? 'done' : anyStarted ? 'running' : 'idle'

  return (
    <div className="orchestrator-canvas">
      <OrchestratorNode
        label="Orchestrator"
        status={anyStarted ? (allParallelDone ? 'done' : 'active') : 'idle'}
        subtitle={allParallelDone ? 'Analysis complete' : anyStarted ? 'Dispatching to 3 specialist agents' : 'Ready to start'}
      />

      <ConnectorLine direction="down" active={active} done={done} />

      <div className="agent-row">
        {PARALLEL_AGENTS.map((key, index) => (
          <AgentCard key={key} agentKey={key} state={steps[key]} index={index} />
        ))}
      </div>

      <ConnectorLine direction="up" active={done} done={done} />

      <div className="pipeline-sequence">
        {POST_MERGE_AGENTS.map((key, index) => {
          const prevStatus = index === 0 ? fanInStatus : steps[POST_MERGE_AGENTS[index - 1]].status
          return (
            <div className="pipeline-sequence__step" key={key}>
              <SequentialConnector status={prevStatus} isFirst={index === 0} />
              <AgentCard agentKey={key} state={steps[key]} index={index} runId={runId} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

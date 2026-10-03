import { motion } from 'framer-motion'
import type { AgentState } from '../../hooks/useRecommendationStream'
import type { AgentKey } from '../../types'
import { PHASES } from './agentMeta'
import { AgentCard } from './AgentCard'
import { CheckIcon, SpinnerIcon } from '../icons'
import { AGENT_NAME } from '../../brand'

interface Props {
  runId?: string | null
  steps: Record<AgentKey, AgentState>
}

type PhaseState = 'idle' | 'running' | 'done'

/**
 * The 11-agent pipeline as four phases — Understand, Decide, Verify, Communicate — each a band of cards.
 * Within a phase the agents are laid side by side (the first phase genuinely runs in parallel); between phases a
 * flowing link shows the hand-off. Every card shows its one-line outcome and opens to the full result on click.
 */
export function OrchestratorCanvas({ runId, steps }: Props) {
  const states: PhaseState[] = PHASES.map((p) => {
    const st = p.agents.map((k) => steps[k].status)
    if (st.every((s) => s === 'done')) return 'done'
    return st.some((s) => s === 'running' || s === 'done') ? 'running' : 'idle'
  })
  const total = PHASES.flatMap((p) => p.agents).length
  const done = PHASES.flatMap((p) => p.agents).filter((k) => steps[k].status === 'done').length

  return (
    <div className="phases">
      <div className={`phases__conductor is-${done === total ? 'done' : done > 0 || states.includes('running') ? 'running' : 'idle'}`}>
        <span className="phases__conductor-icon">{done === total ? <CheckIcon /> : done > 0 || states.includes('running') ? <SpinnerIcon /> : <span />}</span>
        <div>
          <strong>{AGENT_NAME}</strong>
          <small>{done === total ? 'Orchestrator · all 11 agents have reported back' : done > 0 || states.includes('running') ? `Orchestrator · coordinating 11 specialist agents · ${done} complete` : 'Orchestrator · ready to dispatch 11 specialist agents'}</small>
        </div>
      </div>

      {PHASES.map((phase, i) => (
        <div key={phase.id}>
          <PhaseLink state={i === 0 ? (states[0] === 'idle' ? 'idle' : 'done') : states[i - 1]} flowing={states[i] === 'running' && (i === 0 || states[i - 1] === 'done')} />
          <motion.section
            className={`phase phase--${states[i]}`}
            style={{ ['--cols' as string]: Math.min(phase.agents.length, 4) }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <header className="phase__head">
              <span className="phase__n">{states[i] === 'done' ? <CheckIcon /> : phase.n}</span>
              <div>
                <h3>{phase.title}</h3>
                <p>{phase.blurb}</p>
              </div>
              <span className="phase__count">
                {phase.agents.filter((k) => steps[k].status === 'done').length}/{phase.agents.length}
              </span>
            </header>
            <div className="phase__cards">
              {phase.agents.map((key, index) => (
                <AgentCard key={key} agentKey={key} state={steps[key]} index={index} runId={runId} />
              ))}
            </div>
          </motion.section>
        </div>
      ))}
    </div>
  )
}

function PhaseLink({ state, flowing }: { state: PhaseState; flowing: boolean }) {
  return <div className={`phase-link is-${state}${flowing ? ' is-flowing' : ''}`} aria-hidden><span /></div>
}

import { motion } from 'framer-motion'
import { CheckIcon, SpinnerIcon } from '../icons'

type NodeStatus = 'idle' | 'active' | 'done'

interface Props {
  label: string
  subtitle?: string
  status: NodeStatus
}

/** Shared visual for the Orchestrator and Merge nodes — idle/active/done. */
export function OrchestratorNode({ label, subtitle, status }: Props) {
  return (
    <div className={`orchestrator-node orchestrator-node--${status}`}>
      <div className="orchestrator-node__inner">
        <span className="orchestrator-node__icon">
          {status === 'done' && (
            <motion.span
              className="orchestrator-node__check"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <CheckIcon />
            </motion.span>
          )}
          {status === 'active' && (
            <span className="orchestrator-node__spinner">
              <SpinnerIcon />
            </span>
          )}
          {status === 'idle' && <span className="orchestrator-node__dot" />}
        </span>
        <div className="orchestrator-node__text">
          <span className="orchestrator-node__label">{label}</span>
          {subtitle && <span className="orchestrator-node__subtitle">{subtitle}</span>}
        </div>
      </div>
    </div>
  )
}

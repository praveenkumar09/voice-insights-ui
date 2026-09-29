import type { AgentStatus } from '../../types'

interface Props {
  /** Status of the step feeding into this connector — drives the line/dot color. */
  status: AgentStatus
  isFirst: boolean
}

/** A single vertical drop between stacked sequential pipeline steps — the org-chart line style continued downward. */
export function SequentialConnector({ status, isFirst }: Props) {
  if (isFirst) return <div className="pipeline-sequence__connector pipeline-sequence__connector--stub" />
  const classes = ['pipeline-sequence__connector']
  if (status === 'done') classes.push('is-done')
  else if (status === 'running') classes.push('is-active')
  return <div className={classes.join(' ')} />
}

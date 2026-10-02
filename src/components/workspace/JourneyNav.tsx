import { useEffect, useRef } from 'react'

export type JourneyId = 'agents' | 'live' | 'report' | 'future' | 'advice'
export type StepState = 'idle' | 'running' | 'done' | 'new'

export interface JourneyStep {
  id: JourneyId
  title: string
  hint: string
  state: StepState
  chip: string
}

interface Props {
  steps: JourneyStep[]
  active: JourneyId
  onPick: (id: JourneyId) => void
}

/** The five stages as a journey: a rail that fills as stages complete, with the current stage lit. */
export function JourneyNav({ steps, active, onPick }: Props) {
  const reached = steps.filter((s) => s.state === 'done' || s.state === 'new').length
  const fill = steps.length > 1 ? Math.max(0, Math.min(100, ((reached - (reached === steps.length ? 1 : 0.5)) / (steps.length - 1)) * 100)) : 0
  // On a phone the rail scrolls sideways; keep the current stage in view.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.journey__step.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])
  return (
    <nav ref={ref} className="journey" role="tablist" aria-label="Recommendation stages">
      <div className="journey__rail"><span style={{ width: `${reached === 0 ? 0 : fill}%` }} /></div>
      {steps.map((s, i) => (
        <button key={s.id} role="tab" aria-selected={active === s.id} className={`journey__step is-${s.state}${active === s.id ? ' is-active' : ''}`} onClick={() => onPick(s.id)}>
          <span className="journey__dot">{s.state === 'done' ? '✓' : i + 1}</span>
          <span className="journey__title">{s.title}</span>
          <span className="journey__hint">{s.hint}</span>
          <span className={`journey__chip journey__chip--${s.state}`}>{s.chip}</span>
        </button>
      ))}
    </nav>
  )
}

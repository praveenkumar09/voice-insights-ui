import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'

export type JourneyId = 'suggestion' | 'customer' | 'after'
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

/** The three stages as one segmented control: the current stage is lit, finished stages carry a tick, a running one shows its progress. */
export function JourneyNav({ steps, active, onPick }: Props) {
  const reduce = useReducedMotion()
  // On a phone the control wraps; keep the current stage in view.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.journey__step.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [active, reduce])
  return (
    <LayoutGroup id="ws-journey">
      <nav ref={ref} className="journey" role="tablist" aria-label="Suggestion stages"
        onKeyDown={(e) => {
          const i = steps.findIndex((x) => x.id === active)
          if (e.key === 'ArrowRight') onPick(steps[(i + 1) % steps.length].id)
          if (e.key === 'ArrowLeft') onPick(steps[(i + steps.length - 1) % steps.length].id)
        }}>
        {steps.map((s, i) => (
          <button key={s.id} role="tab" aria-selected={active === s.id} tabIndex={active === s.id ? 0 : -1} title={`${s.hint} · ${s.chip}`}
            className={`journey__step is-${s.state}${active === s.id ? ' is-active' : ''}`} onClick={() => onPick(s.id)}>
            {active === s.id && <motion.span layoutId="ws-journey-pill" className="journey__pill" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 }} />}
            <span className="journey__dot">{s.state === 'done' ? '✓' : i + 1}</span>
            <span className="journey__title">{s.title}</span>
            <span className={`journey__chip journey__chip--${s.state}`}>{s.chip}</span>
          </button>
        ))}
      </nav>
    </LayoutGroup>
  )
}

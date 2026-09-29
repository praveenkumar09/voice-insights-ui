import type { CopilotInsights, SignalPoint } from '../../types'

interface GaugeProps {
  label: string
  /** 0..1 position of the needle along the arc */
  value: number
  display: string
  caption: string
  tone: 'sentiment' | 'buying'
  active: boolean
}

// Half-circle arc, drawn as a stroke with a dash-offset so the fill animates smoothly.
const R = 52
const ARC = Math.PI * R

function Gauge({ label, value, display, caption, tone, active }: GaugeProps) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={`gauge gauge--${tone}${active ? '' : ' is-idle'}`}>
      <svg viewBox="0 0 130 78" className="gauge__svg" aria-hidden>
        <path className="gauge__track" d="M13 65 A52 52 0 0 1 117 65" />
        <path
          className="gauge__fill"
          d="M13 65 A52 52 0 0 1 117 65"
          style={{ strokeDasharray: ARC, strokeDashoffset: ARC * (1 - v) }}
        />
      </svg>
      <div className="gauge__readout">
        <span className="gauge__value">{active ? display : '—'}</span>
        <span className="gauge__caption">{active ? caption : 'Waiting for conversation'}</span>
      </div>
      <span className="gauge__label">{label}</span>
    </div>
  )
}

function Sparkline({ points }: { points: SignalPoint[] }) {
  if (points.length < 2) {
    return <div className="timeline__empty">Trend appears as the conversation develops</div>
  }
  const W = 300
  const H = 64
  const x = (i: number) => (i / (points.length - 1)) * W
  const path = (get: (p: SignalPoint) => number) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${(H - get(p) * H).toFixed(1)}`).join(' ')
  const sent = (p: SignalPoint) => (p.sentiment + 100) / 200
  const buy = (p: SignalPoint) => p.buying / 100
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="timeline__svg" preserveAspectRatio="none" aria-hidden>
      <path className="timeline__line timeline__line--buying" d={path(buy)} />
      <path className="timeline__line timeline__line--sentiment" d={path(sent)} />
    </svg>
  )
}

interface Props {
  copilot: CopilotInsights | null
  history: SignalPoint[]
}

export function SignalGauges({ copilot, history }: Props) {
  const s = copilot?.sentiment
  const b = copilot?.buyingSignal
  return (
    <div className="glass-card signal-card">
      <div className="glass-card__label">Customer signals</div>
      <div className="signal-card__gauges">
        <Gauge
          label="Sentiment"
          tone="sentiment"
          active={!!s}
          value={s ? (s.score + 100) / 200 : 0}
          display={s ? s.label : ''}
          caption={s ? s.emotion : ''}
        />
        <Gauge
          label="Buying signal"
          tone="buying"
          active={!!b}
          value={b ? b.score / 100 : 0}
          display={b ? b.level : ''}
          caption={b ? `${b.score} / 100` : ''}
        />
      </div>

      <div className="timeline">
        <Sparkline points={history} />
        <div className="timeline__legend">
          <span className="timeline__key timeline__key--sentiment">Sentiment</span>
          <span className="timeline__key timeline__key--buying">Buying signal</span>
        </div>
      </div>

      {b && b.signals.length > 0 && (
        <ul className="signal-card__triggers">
          {b.signals.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { WEEKDAYS, niceMax, shortDate } from './format'

// ── Shared hover tooltip ──────────────────────────────────────────────────────

interface TipRow {
  key: string
  value: string
  swatch?: string
}
interface TipApi {
  show: (clientX: number, clientY: number, title: string | undefined, rows: TipRow[]) => void
  hide: () => void
}
const TipCtx = createContext<TipApi>({ show: () => {}, hide: () => {} })

/**
 * A card that holds one chart: title, a Chart/Table switch (every chart has a table twin, so no value is reachable
 * only by hovering), and the one tooltip every mark inside it uses. Values lead in the tooltip; names follow.
 */
export function ChartCard(props: {
  title: string
  subtitle?: string
  table?: { head: string[]; rows: (string | number)[][] }
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const ref = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; flip: boolean; title?: string; rows: TipRow[] } | null>(null)
  const api = useMemo<TipApi>(
    () => ({
      show: (cx, cy, title, rows) => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        setTip({ x: cx - r.left, y: cy - r.top, flip: cx - r.left > r.width * 0.6, title, rows })
      },
      hide: () => setTip(null),
    }),
    [],
  )

  return (
    <TipCtx.Provider value={api}>
      <section ref={ref} className={`adm-card adm-rise ${props.className ?? ''}`} style={props.style}>
        <header className="adm-card__head">
          <div>
            <h4>{props.title}</h4>
            {props.subtitle && <p>{props.subtitle}</p>}
          </div>
          {props.table && (
            <div className="adm-switch" role="group" aria-label="Chart or table view">
              <button className={view === 'chart' ? 'is-active' : ''} onClick={() => setView('chart')}>Chart</button>
              <button className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')}>Table</button>
            </div>
          )}
        </header>
        {view === 'chart' || !props.table ? (
          <div className="adm-card__body">{props.children}</div>
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-datatable">
              <thead><tr>{props.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {props.table.rows.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tip && (
          <div className="adm-tip" style={{ left: tip.x, top: tip.y, transform: `translate(${tip.flip ? 'calc(-100% - 14px)' : '14px'}, -50%)` }} role="tooltip">
            {tip.rows.map((r) => (
              <div key={r.key} className="adm-tip__row">
                {r.swatch && <i style={{ background: r.swatch }} />}
                <b>{r.value}</b>
                <span>{r.key}</span>
              </div>
            ))}
            {tip.title && <small>{tip.title}</small>}
          </div>
        )}
      </section>
    </TipCtx.Provider>
  )
}

// ── Trend: area + line with a crosshair ───────────────────────────────────────

export function TrendChart(props: { points: { x: string; y: number }[]; unit: string; height?: number; yMax?: number; decimals?: number }) {
  const { points, unit, height = 210, decimals = 0 } = props
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 640, h: height })
  const [hover, setHover] = useState<number | null>(null)
  const tip = useContext(TipCtx)

  // The chart fills whatever room its card has (never less than `height`), so cards in a row end together.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setSize({ w: Math.max(280, el.clientWidth), h: Math.max(height, Math.min(420, el.clientHeight)) })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [height])
  const w = size.w
  const H = size.h

  if (points.length === 0) return <p className="adm-empty">No data in this period.</p>
  const padL = 36, padR = 18, padT = 16, padB = 28
  const iw = w - padL - padR
  const ih = H - padT - padB
  const max = props.yMax ?? niceMax(Math.max(1, ...points.map((p) => p.y)))
  const x = (i: number) => padL + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw)
  const y = (v: number) => padT + ih - (v / max) * ih
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${padT + ih} L${x(0).toFixed(1)} ${padT + ih} Z`
  const ticks = [0, max / 2, max]
  const fmt = (v: number) => (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString())
  const last = points.length - 1
  const labelIdx = [0, Math.floor(last / 2), last].filter((v, i, a) => a.indexOf(v) === i)

  function move(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last)))
    setHover(i)
    tip.show(e.clientX, e.clientY, shortDate(points[i].x), [{ key: unit, value: fmt(points[i].y), swatch: 'var(--series)' }])
  }

  return (
    <div ref={wrap} className="adm-trend" style={{ minHeight: height }}>
      <svg width={w} height={H} role="img" aria-label={`${unit} over time`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="adm-grid" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="adm-axis">{fmt(t)}</text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="adm-axis">{shortDate(points[i].x)}</text>
        ))}
        <path d={area} className="adm-trend__area" />
        <path d={line} pathLength={1} className="adm-trend__line" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} className="adm-crosshair" />}
        <circle cx={x(hover ?? last)} cy={y(points[hover ?? last].y)} r={5} className="adm-dot" />
        {hover == null && (
          <text x={x(last)} y={y(points[last].y) - 12} textAnchor="end" className="adm-endlabel">{fmt(points[last].y)}</text>
        )}
        <rect x={padL} y={padT} width={iw} height={ih} fill="transparent" onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide() }} />
      </svg>
    </div>
  )
}

/** A small, unlabelled trend line for the hero, drawn in white on the banner. */
export function Sparkline({ points, width = 220, height = 56 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null
  const max = Math.max(1, ...points)
  const x = (i: number) => 3 + (i / (points.length - 1)) * (width - 6)
  const y = (v: number) => height - 5 - (v / max) * (height - 12)
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1)} ${height} L${x(0)} ${height} Z`
  return (
    <svg className="adm-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={area} className="adm-spark__area" />
      <path d={line} pathLength={1} className="adm-spark__line" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={4} className="adm-spark__dot" />
    </svg>
  )
}

// ── Funnel: ordered stages on the one-hue ramp ─────────────────────────────────

export function Funnel({ stages }: { stages: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value))
  const tip = useContext(TipCtx)
  return (
    <div className="adm-funnel">
      {stages.map((s, i) => {
        const pct = (100 * s.value) / max
        const prev = i > 0 ? stages[i - 1].value : null
        const conv = prev && prev > 0 ? Math.round((100 * s.value) / prev) : null
        return (
          <div
            key={s.label}
            className="adm-funnel__row"
            style={{ '--i': i } as CSSProperties}
            tabIndex={0}
            onPointerMove={(e) => tip.show(e.clientX, e.clientY, s.note, [{ key: s.label, value: s.value.toLocaleString(), swatch: `var(--ord-${i + 1})` }, ...(conv != null ? [{ key: 'of the previous stage', value: `${conv}%` }] : [])])}
            onPointerLeave={tip.hide}
          >
            <span className="adm-funnel__label">{s.label}</span>
            <span className="adm-funnel__track">
              <span className="adm-funnel__bar" style={{ width: `${Math.max(pct, s.value > 0 ? 1.5 : 0)}%`, background: `var(--ord-${i + 1})` }} />
              <b>{s.value.toLocaleString()}</b>
            </span>
            <span className="adm-funnel__conv">{conv != null ? `${conv}%` : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Ranked horizontal bars (one series, one colour) ────────────────────────────

export function HBarList(props: { rows: { label: string; value: number; detail?: string }[]; unit: string; empty?: string }) {
  const tip = useContext(TipCtx)
  if (props.rows.length === 0) return <p className="adm-empty">{props.empty ?? 'Nothing to show yet.'}</p>
  const max = Math.max(1, ...props.rows.map((r) => r.value))
  return (
    <ul className="adm-hbars">
      {props.rows.map((r, i) => (
        <li
          key={r.label}
          style={{ '--i': i } as CSSProperties}
          tabIndex={0}
          onPointerMove={(e) => tip.show(e.clientX, e.clientY, r.label, [{ key: props.unit, value: r.value.toLocaleString(), swatch: 'var(--series)' }, ...(r.detail ? [{ key: r.detail, value: '' }] : [])])}
          onPointerLeave={tip.hide}
        >
          <span className="adm-hbars__label" title={r.label}>{r.label}</span>
          <span className="adm-hbars__track">
            <span className="adm-hbars__bar" style={{ width: `${Math.max(2, (100 * r.value) / max)}%` }} />
            <b>{r.value}</b>
          </span>
        </li>
      ))}
    </ul>
  )
}

// ── One stacked bar with a legend ──────────────────────────────────────────────

export function SplitBar({ parts, unit }: { parts: { label: string; value: number; color: string }[]; unit: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  const tip = useContext(TipCtx)
  return (
    <div className="adm-split">
      <div className="adm-split__bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {total === 0 && <span className="adm-split__none" />}
        {parts.filter((p) => p.value > 0).map((p) => (
          <span
            key={p.label}
            className="adm-split__seg"
            style={{ flexGrow: p.value, background: p.color }}
            tabIndex={0}
            onPointerMove={(e) => tip.show(e.clientX, e.clientY, undefined, [{ key: `${p.label} ${unit}`, value: `${p.value} · ${Math.round((100 * p.value) / total)}%`, swatch: p.color }])}
            onPointerLeave={tip.hide}
          />
        ))}
      </div>
      <ul className="adm-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{p.value}</b>
            <em>{total ? `${Math.round((100 * p.value) / total)}%` : '—'}</em>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Weekday × hour heatmap ─────────────────────────────────────────────────────

export function Heatmap({ grid }: { grid: number[] }) {
  const tip = useContext(TipCtx)
  const max = Math.max(1, ...grid)
  const bucket = (v: number) => (v === 0 ? 0 : Math.min(5, Math.ceil((5 * v) / max)))
  const hours = Array.from({ length: 24 }, (_, h) => h)
  return (
    <div className="adm-heat" role="img" aria-label="Conversations by weekday and hour">
      <div className="adm-heat__hours" aria-hidden>
        <span />
        {hours.map((h) => <span key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
      </div>
      {WEEKDAYS.map((d, di) => (
        <div className="adm-heat__row" key={d}>
          <span className="adm-heat__day">{d}</span>
          {hours.map((h) => {
            const v = grid[di * 24 + h] ?? 0
            return (
              <i
                key={h}
                className={`adm-heat__cell b${bucket(v)}`}
                tabIndex={v ? 0 : -1}
                onPointerMove={(e) => tip.show(e.clientX, e.clientY, `${d} ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`, [{ key: 'conversations', value: String(v), swatch: v ? `var(--ord-${bucket(v)})` : undefined }])}
                onPointerLeave={tip.hide}
              />
            )
          })}
        </div>
      ))}
      <div className="adm-heat__scale" aria-hidden>
        <span>Fewer</span>
        {[1, 2, 3, 4, 5].map((b) => <i key={b} className={`adm-heat__cell b${b}`} />)}
        <span>More</span>
      </div>
    </div>
  )
}

// ── Meter ──────────────────────────────────────────────────────────────────────

export function Meter({ value, tone }: { value: number; tone: 'good' | 'warn' | 'crit' | 'brand' }) {
  return (
    <span className={`adm-meter adm-meter--${tone}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  )
}

import { relevanceLabel } from '../../utils/relevance'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LifeMapConcern, LifeMapData, LifeMapPerson } from '../../types'
import { forLabel } from '../../utils/names'

interface Props {
  customerName?: string | null
  lifeMap?: LifeMapData | null
  listening: boolean
  /** Customer-safe view: no product names, protection ideas or fit scores — only what the customer themselves said. */
  safe?: boolean
  /** The map was built from the advisor's dictation, not a live conversation. */
  debrief?: boolean
  /** Live product matches: their score is the single source of truth for how relevant a product is. */
  matches?: { productName: string; fitScore: number }[]
}

interface Placed {
  key: string
  kind: 'person' | 'dream' | 'worry'
  x: number // percent of the stage
  y: number
  label: string
  sub?: string
  said: string
  idea?: { product: string; fit: number } | null
  relation?: string
  child?: boolean
}

const CHILD = /^(daughter|son|child|kid|baby|toddler)/i
const rad = (deg: number) => (deg * Math.PI) / 180

/** Ellipse point, as a percentage of the stage: the map is wider than it is tall. */
function onEllipse(cx: number, cy: number, rx: number, ry: number, deg: number) {
  return { x: cx + rx * Math.cos(rad(deg)), y: cy + ry * Math.sin(rad(deg)) }
}

const personKey = (p: LifeMapPerson) => `p:${p.relation.toLowerCase()}:${(p.name ?? '').toLowerCase()}`

// Stage height in px; the width is measured, so overlaps are resolved against the real stage.
const H = 440
// Below this card width a radial map cannot fit its chips without covering each other: a stacked layout is used.
const COMPACT_BELOW = 640
const PAD = 14

export function layout(map: LifeMapData, W = 1100): Placed[] {
  const out: Placed[] = []
  const n = map.people.length
  const personAngle = new Map<string, number>()

  // People sit on the inner orbit, spread evenly around the customer — starting on a diagonal so nobody lands at
  // the very top or bottom, where there is least room for their hopes and worries.
  map.people.forEach((p, i) => {
    const deg = n === 1 ? 180 : -135 + (360 / n) * i
    personAngle.set(p.relation.toLowerCase(), deg)
    const pt = onEllipse(50, 50, 22, 25, deg)
    out.push({
      key: personKey(p), kind: 'person', ...pt, label: p.name ?? p.relation, sub: p.name ? p.relation : undefined,
      said: p.said, relation: p.relation, child: CHILD.test(p.relation),
    })
  })

  // Dreams and worries go on the outer orbit beside whoever they are for ("Self" ones prefer the sides, where the
  // stage is widest). Each tries candidate spots — nearest to its preferred angle first, at a few radii — and
  // takes the first that fits on the stage without touching anything already placed.
  const concerns: { c: LifeMapConcern; kind: 'dream' | 'worry' }[] = [
    ...map.dreams.map((c) => ({ c, kind: 'dream' as const })),
    ...map.worries.map((c) => ({ c, kind: 'worry' as const })),
  ]
  // A chip with a protection idea carries the product name inline (capped at 150px by the stylesheet).
  const box = (n: Placed) =>
    n.kind === 'person' ? { w: 100, h: 104 } : { w: n.label.length * 8 + 96 + (n.idea ? Math.min(n.idea.product.length * 6.5, 150) + 16 : 0), h: 56 }
  const overlap = (a: Placed, b: Placed) => {
    const ba = box(a), bb = box(b)
    const ox = (ba.w + bb.w + PAD) / 2 - Math.abs((a.x - b.x) * (W / 100))
    const oy = (ba.h + bb.h + PAD) / 2 - Math.abs((a.y - b.y) * (H / 100))
    return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0
  }
  const outside = (n: Placed) => {
    const b = box(n)
    const l = (n.x / 100) * W - b.w / 2, r = (n.x / 100) * W + b.w / 2
    const t = (n.y / 100) * H - b.h / 2, bt = (n.y / 100) * H + b.h / 2
    return Math.max(0, 8 - l) + Math.max(0, r - (W - 8)) + Math.max(0, 6 - t) + Math.max(0, bt - (H - 6))
  }

  // The customer in the middle is an obstacle too.
  const hub: Placed = { key: 'hub', kind: 'person', x: 50, y: 50, label: '', said: '' }
  const perAnchor = new Map<string, number>()
  let selfIdx = 0
  const placed: Placed[] = []
  concerns.forEach(({ c, kind }) => {
    const rel = c.forRelation.toLowerCase()
    const anchor = personAngle.get(rel)
    let base: number
    if (anchor !== undefined) {
      const k = perAnchor.get(rel) ?? 0
      perAnchor.set(rel, k + 1)
      base = anchor + (k % 2 === 0 ? 1 : -1) * Math.ceil((k + 1) / 2) * 26
    } else {
      base = [180, 0, 156, 24, 204, 336][selfIdx % 6]
      selfIdx++
    }
    const node: Placed = {
      key: `${kind}:${c.label.toLowerCase()}`, kind, x: 50, y: 50, label: c.label,
      sub: anchor !== undefined ? `for ${forLabel(c.forRelation)}` : undefined, said: c.said, idea: c.idea,
    }
    const costAt = (x: number, y: number) => {
      node.x = x
      node.y = y
      return outside(node) * 50 + [...out, ...placed, hub].reduce((sum, o) => sum + overlap(node, o), 0)
    }
    let best: { x: number; y: number; cost: number } | null = null
    search: for (const ring of [1, 0.9, 1.08, 0.78]) {
      for (let step = 0; step <= 14; step++) {
        const delta = step === 0 ? 0 : (step % 2 === 1 ? 1 : -1) * Math.ceil(step / 2) * 20
        const pt = onEllipse(50, 50, 41 * ring, 40 * ring, base + delta)
        const cost = costAt(pt.x, pt.y)
        if (best === null || cost < best.cost) best = { ...pt, cost }
        if (cost === 0) break search
      }
    }
    // Crowded stage: scan the whole stage for any free spot, preferring the one closest to where it wanted to be.
    if (best && best.cost > 0) {
      const want = onEllipse(50, 50, 41, 40, base)
      let bestGrid: { x: number; y: number; d: number } | null = null
      for (let gy = 10; gy <= 90; gy += 6) {
        for (let gx = 8; gx <= 92; gx += 3) {
          if (costAt(gx, gy) === 0) {
            const d = Math.hypot((gx - want.x) * (W / 100), (gy - want.y) * (H / 100))
            if (bestGrid === null || d < bestGrid.d) bestGrid = { x: gx, y: gy, d }
          }
        }
      }
      if (bestGrid) best = { x: bestGrid.x, y: bestGrid.y, cost: 0 }
    }
    if (best) {
      node.x = best.x
      node.y = best.y
    }
    placed.push(node)
  })
  return [...out, ...placed]
}

/**
 * The customer's world, drawn live as they speak: who they are protecting, what they hope for and what worries
 * them. Everything on the map is backed by words the customer actually said (shown on hover and in the
 * "just heard" line), and a dream or worry that matches a product shows the protection idea beside it.
 */
export function LifeMap({ customerName, lifeMap, listening, safe = false, debrief = false, matches = [] }: Props) {
  const map: LifeMapData = lifeMap ?? { people: [], dreams: [], worries: [] }
  const rootRef = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(1100)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth / 25) * 25))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const compact = width < COMPACT_BELOW
  const nodes = useMemo(() => layout(map, width), [lifeMap, width]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = nodes.length

  // "Just heard": announce whatever appeared since the last update.
  const seen = useRef<Set<string>>(new Set())
  const [heard, setHeard] = useState<Placed | null>(null)
  useEffect(() => {
    const fresh = nodes.filter((n) => !seen.current.has(n.key))
    nodes.forEach((n) => seen.current.add(n.key))
    if (fresh.length === 0) return
    setHeard(fresh[fresh.length - 1])
    const t = setTimeout(() => setHeard(null), 7000)
    return () => clearTimeout(t)
  }, [nodes])
  useEffect(() => {
    if (total === 0) seen.current = new Set()
  }, [total])

  // Protection ideas, grouped by product: which dreams and worries each one answers. Hover or click one to light
  // up those chips on the map.
  const [pinned, setPinned] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  // One number per product everywhere: the live match score when there is one, else the concern's own idea score.
  const fitFor = (product: string, ideaFit: number) => matches.find((m) => m.productName === product)?.fitScore ?? ideaFit
  const ideaGroups = useMemo(() => {
    const groups = new Map<string, { product: string; fit: number; covers: { key: string; label: string; kind: 'dream' | 'worry' }[] }>()
    const add = (c: LifeMapConcern, kind: 'dream' | 'worry') => {
      if (!c.idea) return
      const g = groups.get(c.idea.product) ?? { product: c.idea.product, fit: 0, covers: [] }
      g.fit = Math.max(g.fit, fitFor(c.idea.product, c.idea.fit))
      g.covers.push({ key: `${kind}:${c.label.toLowerCase()}`, label: c.label, kind })
      groups.set(c.idea.product, g)
    }
    map.dreams.forEach((c) => add(c, 'dream'))
    map.worries.forEach((c) => add(c, 'worry'))
    return [...groups.values()].sort((a, b) => b.fit - a.fit)
  }, [lifeMap, matches]) // eslint-disable-line react-hooks/exhaustive-deps
  const focus = safe ? null : hovered ?? (pinned && ideaGroups.some((g) => g.product === pinned) ? pinned : null)

  const people = map.people.length
  const ideas = safe ? 0 : [...map.dreams, ...map.worries].filter((c) => c.idea).length
  const personNodes = nodes.filter((n) => n.kind === 'person')
  const byRelation = new Map(personNodes.map((n) => [n.relation!.toLowerCase(), n]))
  const center = { x: 50, y: 50 }
  const initial = (customerName ?? '').trim().charAt(0).toUpperCase()

  return (
    <section ref={rootRef} className={`glass-card lifemap${listening ? ' is-live' : ''}${compact ? ' is-compact' : ''}`} aria-label="Life map">
      <header className="lifemap__head">
        <div>
          <div className="glass-card__label">
            Life map <span className="live-tag">{debrief ? 'Built from your dictation' : 'Built live from the conversation'}</span>
          </div>
        </div>
        <div className="lifemap__counts">
          <span><b>{people}</b> {people === 1 ? 'person' : 'people'}</span>
          <span><b>{map.dreams.length}</b> {safe ? (map.dreams.length === 1 ? 'hope' : 'hopes') : (map.dreams.length === 1 ? 'dream' : 'dreams')}</span>
          <span><b>{map.worries.length}</b> {safe ? (map.worries.length === 1 ? 'concern' : 'concerns') : (map.worries.length === 1 ? 'worry' : 'worries')}</span>
          {!safe && <span className="lifemap__counts-idea"><b>{ideas}</b> protection {ideas === 1 ? 'idea' : 'ideas'}</span>}
        </div>
      </header>

      {compact ? (
        <div className="lifemap__stack">
          <div className="lifemap__center lifemap__center--stack">
            <span className="lifemap__center-ring" />
            <span className="lifemap__center-core">{initial || '♥'}</span>
            <span className="lifemap__center-name">{customerName ?? (listening ? 'Listening…' : 'Your customer')}</span>
          </div>
          {total === 0 && (
            <div className="lifemap__empty lifemap__empty--stack">
              {listening ? 'Listening… the people, hopes and worries in their life will appear here as they speak.' : 'Start — their family, hopes and worries will take shape here.'}
            </div>
          )}
          {personNodes.length > 0 && (
            <div className="lifemap__group">
              <div className="lifemap__group-title">People</div>
              <div className="lifemap__people">
                <AnimatePresence initial={false}>
                  {personNodes.map((n) => (
                    <motion.div key={n.key} className={`lifemap__person-card${n.child ? ' is-child' : ''}`} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <span className="lifemap__person"><Glyph child={!!n.child} /></span>
                      <span className="lifemap__label">{n.label}{n.sub && <small>{n.sub}</small>}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
          {(['dream', 'worry'] as const).map((kind) => {
            const list = nodes.filter((n) => n.kind === kind)
            if (list.length === 0) return null
            return (
              <div className="lifemap__group" key={kind}>
                <div className="lifemap__group-title">{kind === 'dream' ? (safe ? 'Hopes' : 'Dreams') : (safe ? 'Concerns' : 'Worries')}</div>
                <ul className="lifemap__stack-list">
                  <AnimatePresence initial={false}>
                    {list.map((n) => (
                      <motion.li key={n.key} className={`lifemap__node-row lifemap__node--${kind}${n.idea && !safe ? ' has-idea' : ''}${focus ? (n.idea?.product === focus ? ' is-linked' : ' is-dim') : ''}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <span className="lifemap__chip">
                          <i>{kind === 'dream' ? '✦' : '!'}</i>
                          {n.label}
                          {n.sub && <span className="lifemap__sub">{n.sub}</span>}
                        </span>
                        <q className="lifemap__row-said">{n.said}</q>
                        {n.idea && !safe && (
                          <span className="lifemap__product">
                            <svg className="lifemap__shield" viewBox="0 0 20 22" aria-hidden>
                              <path d="M10 1l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V4z" />
                              <path d="M6.5 11l2.4 2.4L13.6 8.7" />
                            </svg>
                            <span>{n.idea.product} · {relevanceLabel(fitFor(n.idea.product, n.idea.fit))}</span>
                          </span>
                        )}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            )
          })}
        </div>
      ) : (
      <div className="lifemap__stage">
        <div className="lifemap__orbit lifemap__orbit--1" />
        <div className="lifemap__orbit lifemap__orbit--2" />

        <svg className="lifemap__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {nodes.map((n) => {
            const anchor = n.kind === 'person' ? center : (() => {
              const c = [...map.dreams, ...map.worries].find((x) => `${n.kind}:${x.label.toLowerCase()}` === n.key)
              return (c && byRelation.get(c.forRelation.toLowerCase())) || center
            })()
            return (
              <motion.line
                key={n.key}
                className={`lifemap__line lifemap__line--${n.kind}`}
                initial={{ x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y, opacity: 0 }}
                animate={{ x1: anchor.x, y1: anchor.y, x2: n.x, y2: n.y, opacity: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>

        <div className="lifemap__center" style={{ left: `${center.x}%`, top: `${center.y}%` }}>
          <span className="lifemap__center-ring" />
          <span className="lifemap__center-core">{initial || '♥'}</span>
          <span className="lifemap__center-name">{customerName ?? (listening ? 'Listening…' : 'Your customer')}</span>
        </div>

        <AnimatePresence>
          {nodes.map((n) => (
            <motion.div
              key={n.key}
              className={`lifemap__node lifemap__node--${n.kind}${n.idea && !safe ? ' has-idea' : ''}${n.child ? ' is-child' : ''}${focus && n.kind !== 'person' ? (n.idea?.product === focus ? ' is-linked' : ' is-dim') : ''}`}
              style={{ x: '-50%', y: '-50%' }}
              initial={{ left: `${center.x}%`, top: `${center.y}%`, scale: 0, opacity: 0 }}
              animate={{ left: `${n.x}%`, top: `${n.y}%`, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
              tabIndex={0}
            >
              {n.kind === 'person' ? (
                <span className="lifemap__person"><Glyph child={!!n.child} /></span>
              ) : (
                <span className="lifemap__chip">
                  <i>{n.kind === 'dream' ? '✦' : '!'}</i>
                  {n.label}
                  {n.idea && !safe && (
                    <span className="lifemap__product" title={`${n.idea.product} (${relevanceLabel(fitFor(n.idea.product, n.idea.fit))})`}>
                      <svg className="lifemap__shield" viewBox="0 0 20 22" aria-label="A protection idea matches this">
                        <path d="M10 1l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V4z" />
                        <path d="M6.5 11l2.4 2.4L13.6 8.7" />
                      </svg>
                      <span>{n.idea.product}</span>
                    </span>
                  )}
                </span>
              )}
              {n.kind === 'person' && (
                <span className="lifemap__label">
                  {n.label}
                  {n.sub && <small>{n.sub}</small>}
                </span>
              )}
              {n.kind !== 'person' && n.sub && <span className="lifemap__sub">{n.sub}</span>}
              <span className="lifemap__pop" role="tooltip">
                <q>{n.said}</q>
                {n.idea && !safe && (
                  <span className="lifemap__pop-idea">
                    Protection idea · <b>{n.idea.product}</b> ({relevanceLabel(fitFor(n.idea.product, n.idea.fit))})
                  </span>
                )}
              </span>
              <span className="lifemap__ripple" />
            </motion.div>
          ))}
        </AnimatePresence>

        {total === 0 && (
          <div className="lifemap__empty">
            {listening ? (debrief ? 'Listening… the people, hopes and worries you describe will appear here.' : 'Listening… the people, hopes and worries in their life will appear here as they speak.') : (debrief ? 'Start dictating — their family, hopes and worries will take shape here.' : 'Start the conversation — their family, hopes and worries will take shape here.')}
          </div>
        )}
      </div>
      )}

      {!safe && ideaGroups.length > 0 && (
        <div className="lifemap__ideas">
          <div className="lifemap__ideas-title">Protection ideas</div>
          <ul>
            {ideaGroups.map((g) => (
              <li key={g.product}>
                <button
                  className={`lifemap__idea${focus === g.product ? ' is-active' : ''}`}
                  aria-pressed={pinned === g.product}
                  onMouseEnter={() => setHovered(g.product)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(g.product)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setPinned((p) => (p === g.product ? null : g.product))}
                >
                  <span className="lifemap__idea-head">
                    <b>{g.product}</b>
                    <em>{relevanceLabel(g.fit)}</em>
                  </span>
                  <span className="lifemap__idea-covers">
                    {g.covers.map((c) => (
                      <span key={c.key} className={`lifemap__idea-for lifemap__idea-for--${c.kind}`}>
                        <i>{c.kind === 'dream' ? '✦' : '!'}</i>
                        {c.label}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {heard && (
          <motion.div className="lifemap__heard" key={heard.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className="lifemap__heard-dot" />
            Just heard <b>{heard.label}</b> — <q>{heard.said}</q>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function Glyph({ child }: { child: boolean }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy={child ? 15 : 13} r={child ? 6 : 7} />
      <path d={child ? 'M9 35c0-7 5-11 11-11s11 4 11 11z' : 'M6 37c0-9 6-15 14-15s14 6 14 15z'} />
    </svg>
  )
}

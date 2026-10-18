import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LifeMapData } from '../../types'
import { groupWorld, type Circle, type Item } from './worldGroups'
import './theirworld.css'
import './constellation.css'

interface Props {
  customerName?: string | null
  lifeMap?: LifeMapData | null
  /** Juno is listening: the customer's ring breathes and the tag says Live. */
  live?: boolean
  /** The map shows the advisor's edits that are not saved yet. */
  unsaved?: boolean
}

const Shield = () => (
  <svg viewBox="0 0 20 22" aria-hidden><path d="M10 1l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V4z" /><path d="M6.5 11l2.4 2.4L13.6 8.7" /></svg>
)

/**
 * The customer's world as a tree: their ring at the top and, joined to it by hairlines, one column for them and one for each person they
 * mention. Every column is the same width and the same height in its row, so it always looks balanced however much each person has;
 * a hope or worry sits in it as a pill, with the product that answers it underneath. New people grow out of the ring and the lines draw
 * to them as Juno hears them.
 */
export function Constellation({ customerName, lifeMap, live = false, unsaved = false }: Props) {
  const reduce = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const pearlRef = useRef<HTMLDivElement>(null)
  const colRefs = useRef(new Map<string, HTMLElement>())
  const [open, setOpen] = useState<string | null>(null)
  const [paths, setPaths] = useState<{ key: string; d: string }[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const { self, people, counts } = useMemo(() => groupWorld(lifeMap, customerName), [lifeMap, customerName])
  const empty = people.length + self.items.length === 0
  const hidden = !live && empty
  const columns: Circle[] = useMemo(() => (self.items.length > 0 ? [self, ...people] : people), [self, people])
  const signature = columns.map((c) => `${c.key}:${c.items.length}`).join('|') + `|${open}`

  // Join the ring to each column: measured from the page, so it stays right when the window, the columns or an opened quote change size.
  useLayoutEffect(() => {
    const stage = stageRef.current
    const pearl = pearlRef.current
    if (!stage || !pearl || hidden) return
    // Layout positions (not on-screen ones), so the lines are right even while a column is still springing into place.
    const within = (el: HTMLElement) => {
      let x = 0, y = 0
      let cur: HTMLElement | null = el
      while (cur && cur !== stage) { x += cur.offsetLeft; y += cur.offsetTop; cur = cur.offsetParent as HTMLElement | null }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight }
    }
    const measure = () => {
      const p = within(pearl)
      const x1 = p.x + p.w / 2
      const y1 = p.y + p.h - 4
      const boxes = columns.flatMap((c) => { const el = colRefs.current.get(c.key); return el ? [{ key: c.key, ...within(el) }] : [] })
      const top = Math.min(...boxes.map((b) => b.y))
      const next: { key: string; d: string }[] = []
      boxes.filter((b) => b.y === top).forEach((b) => {
        const x2 = b.x + b.w / 2
        const mid = y1 + (b.y - y1) * 0.55
        next.push({ key: b.key, d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${b.y}` })
      })
      setPaths(next)
      setSize({ w: stage.offsetWidth, h: stage.offsetHeight })
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(stage)
    return () => ro?.disconnect()
  }, [signature, hidden]) // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden) return null

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 170, damping: 22 }
  const drawn = reduce ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }
  const n = Math.max(1, columns.length)
  // As many equal columns as fit at a readable width (at most five); more people wrap to a second row.
  const fit = Math.max(1, Math.min(n, 5, Math.floor((size.w || 900) / 150)))
  const cols = Math.ceil(n / Math.ceil(n / fit)) // wrap into even rows, never one left alone

  const pill = (it: Item, key: string) => {
    const on = open === key
    return (
      <motion.li key={key} layout="position" initial={reduce ? false : { opacity: 0, y: -10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring}>
        <button className={`cs__pill cs__pill--${it.kind}${on ? ' is-open' : ''}`} onClick={() => setOpen(on ? null : key)} aria-expanded={on}>
          <i aria-hidden>{it.kind === 'hope' ? '✦' : '!'}</i>
          <span className="cs__pill-text">
            <b>{it.label}</b>
            {it.idea && <em><Shield />{it.idea.product}</em>}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {on && <motion.q className="cs__quote" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring}>{it.said}</motion.q>}
        </AnimatePresence>
      </motion.li>
    )
  }

  return (
    <section className={`tw tw--live cs${live ? ' is-live' : ''}`} aria-label="Their world">
      <header className="tw__head">
        <div>
          <h3>Their world {live && <span className="tw__live" aria-label="Updating as Juno listens"><i />Live</span>}{unsaved && <span className="tw__unsaved">Your changes, not saved yet</span>}</h3>
          <p>{[`${counts.people} ${counts.people === 1 ? 'person' : 'people'}`, `${counts.hopes} ${counts.hopes === 1 ? 'hope' : 'hopes'}`, `${counts.worries} ${counts.worries === 1 ? 'concern' : 'concerns'}`].join('  ·  ')}</p>
        </div>
      </header>

      <div ref={stageRef} className="cs__stage">
        {empty ? (
          <p className="cs__empty">Listening… the people, hopes and worries you describe will appear here.</p>
        ) : (
          <>
            <svg className="cs__lines" width={size.w} height={size.h} aria-hidden>
              {paths.map((p) => (
                <motion.path key={p.key} className="cs__line" d={p.d} initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={drawn} />
              ))}
            </svg>

            <motion.div ref={pearlRef} className="cs__me" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
              <span className="cs__ring" /><span className="cs__core">{self.initial || '♥'}</span>
              <small>{self.title}</small>
            </motion.div>

            <ul className={`cs__grid${cols >= 5 ? ' is-tight' : ''}`} style={{ ['--cols' as string]: cols }}>
              <AnimatePresence>
                {columns.map((c) => (
                  <motion.li key={c.key} ref={(el: HTMLElement | null) => { if (el) colRefs.current.set(c.key, el); else colRefs.current.delete(c.key) }}
                    className={`cs__col${c.self ? ' is-self' : ''}`} layout="position"
                    initial={reduce ? false : { opacity: 0, y: -48, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={spring}>
                    <div className="cs__person">
                      {c.self ? <span className="tw__avatar is-me" aria-hidden>✦</span> : <span className={`tw__avatar${c.child ? ' is-child' : ''}`} aria-hidden>{c.initial || '♥'}</span>}
                      <span>
                        <b>{c.self ? 'Their own' : c.title}</b>
                        <small>{c.self ? 'Hopes and worries' : c.sub ?? 'Family'}</small>
                      </span>
                    </div>
                    {c.items.length === 0 ? (
                      <p className="cs__none">{c.said === 'Added by you' ? c.said : c.said ? <q>{c.said}</q> : 'Nothing specific yet.'}</p>
                    ) : (
                      <ul className="cs__stack">
                        <AnimatePresence initial={false}>{c.items.map((it) => pill(it, `${c.key}|${it.kind}|${it.label}`))}</AnimatePresence>
                      </ul>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useMemo, useState } from 'react'
import type { LifeMapData } from '../../types'
import { groupWorld } from './worldGroups'
import './theirworld.css'

interface Props {
  customerName?: string | null
  lifeMap?: LifeMapData | null
  /** Juno is listening right now: new people and concerns land with a soft glow. */
  live?: boolean
  /** Where it sits: "Summary" shows a title and the counts; "live" is a little quieter. */
  variant?: 'summary' | 'live'
}

/**
 * Their world: who matters to the customer, and what they hope for and worry about, grouped by person. It is the Life map in the
 * debrief, drawn the way the rest of the app is: calm cards, one idea each, a quote behind every line.
 */
export function TheirWorld({ customerName, lifeMap, live = false, variant = 'summary' }: Props) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState<string | null>(null)
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 30 }

  const { circles, counts } = useMemo(() => groupWorld(lifeMap, customerName), [lifeMap, customerName])
  const empty = counts.people + counts.hopes + counts.worries === 0
  if (variant === 'live' && empty && !live) return null
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

  return (
    <section className={`tw tw--${variant}${live ? ' is-live' : ''}`} aria-label="Their world">
      <header className="tw__head">
        <div>
          <h3>Their world {live && <span className="tw__live" aria-label="Updating as Juno listens"><i />Live</span>}</h3>
          <p>{empty ? 'Who matters to them, and what they hope for and worry about.' : [plural(counts.people, 'person', 'people'), plural(counts.hopes, 'hope'), plural(counts.worries, 'concern')].join('  ·  ')}</p>
        </div>
      </header>

      {empty ? (
        <p className="tw__empty">{live ? 'Listening… the people, hopes and worries you describe will appear here.' : 'No people, hopes or worries were picked out of this conversation.'}</p>
      ) : (
        <LayoutGroup>
          <div className="tw__grid">
            <AnimatePresence initial={!live}>
              {circles.map((c, i) => (
                <motion.article
                  key={c.key} layout className={`tw__card${c.self ? ' is-self' : ''}`}
                  initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ ...spring, delay: reduce || live ? 0 : i * 0.05 }}
                >
                  <div className="tw__who">
                    <span className={`tw__avatar${c.child ? ' is-child' : ''}${c.self ? ' is-self' : ''}`} aria-hidden>{c.initial || '♥'}</span>
                    <div>
                      <b>{c.title}</b>
                      {c.sub && <small>{c.sub}</small>}
                    </div>
                  </div>
                  {c.items.length === 0 ? (
                    <p className="tw__none">{c.said === 'Added by you' ? c.said : c.said ? <q>{c.said}</q> : 'Nothing specific yet.'}</p>
                  ) : (
                    <ul className="tw__items">
                      <AnimatePresence initial={false}>
                        {c.items.map((it) => {
                          const id = `${c.key}|${it.kind}|${it.label}`
                          const on = open === id
                          return (
                            <motion.li key={id} layout initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring}>
                              <button className={`tw__item tw__item--${it.kind}`} onClick={() => setOpen(on ? null : id)} aria-expanded={on}>
                                <i aria-hidden>{it.kind === 'hope' ? '✦' : '!'}</i>
                                <span className="tw__item-text">
                                  {it.label}
                                  {it.idea && (
                                    <em className="tw__item-idea">
                                      <svg viewBox="0 0 20 22" aria-hidden><path d="M10 1l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V4z" /><path d="M6.5 11l2.4 2.4L13.6 8.7" /></svg>
                                      {it.idea.product}
                                    </em>
                                  )}
                                </span>
                              </button>
                              <AnimatePresence initial={false}>
                                {on && (
                                  <motion.div className="tw__more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring}>
                                    <q>{it.said}</q>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ul>
                  )}
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      )}
    </section>
  )
}

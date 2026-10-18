import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useRef } from 'react'
import type { VoicePhase } from '../../hooks/useVoiceCommand'
import { MicIcon } from '../icons'
import { InlineEdit } from './InlineEdit'

export type Exception =
  | { id: string; kind: 'name'; value: string }
  | { id: string; kind: 'budget'; value: string }
  | { id: string; kind: 'flag'; statement: string; advice: string; severity: 'high' | 'caution' }
  | { id: string; kind: 'missing'; label: string }

interface Props {
  /** The things still needing a look, in the order to show them. */
  items: Exception[]
  /** How many there were to begin with (for "1 of 3"). */
  total: number
  onResolve: (id: string) => void
  onSkip: (id: string) => void
  onSaveName: (v: string) => Promise<void>
  onSaveBudget: (v: string) => Promise<void>
  onOpenDetails: () => void
  onShowInText: (statement: string) => void
  /** Say the spelling of the name out loud. */
  onSpell: () => void
  spellPhase: VoicePhase
}

/** "$500." becomes "$500 per month." so the unit is part of the fact, not a note beside it. */
export function withUnit(value: string, unit: 'month' | 'year'): string {
  const clean = value.trim().replace(/[.\s]+$/, '')
  return `${clean} per ${unit}`
}

/**
 * Only what needs a person: one card at a time, one decision on each. When the stack is empty the page says so, and the main button
 * becomes "Approve". Confirming is never required: a card can be skipped, and approval is still possible.
 */
export function ExceptionStack({ items, total, onResolve, onSkip, onSaveName, onSaveBudget, onOpenDetails, onShowInText, onSpell, spellPhase }: Props) {
  const reduce = useReducedMotion()
  const card = items[0]
  const position = total - items.length + 1

  // After a decision, focus moves to the next card's main action (as it mounts), so the whole review can be done from the keyboard.
  const refocus = useRef(false)
  const setPrimary = (el: HTMLButtonElement | null) => {
    if (el && refocus.current) {
      refocus.current = false
      el.focus({ preventScroll: true })
    }
  }
  const decide = (id: string) => { refocus.current = true; onResolve(id) }
  const defer = (id: string) => { refocus.current = true; onSkip(id) }

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 36 }

  if (!card) {
    return (
      <motion.div className="rv__card rv__done" initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring} role="status">
        <span className="rv__done-mark" aria-hidden><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <div>
          <h3>All checked</h3>
          <p>Nothing else needs your attention. You can approve now, or look through the details.</p>
        </div>
      </motion.div>
    )
  }

  return (
    <section className="rv__stack" aria-label={`Check ${items.length} thing${items.length === 1 ? '' : 's'}`}>
      <div className="rv__stack-head">
        <h2>Check {items.length} thing{items.length === 1 ? '' : 's'}</h2>
        <span className="rv__dots" aria-hidden>
          {Array.from({ length: total }, (_, i) => <i key={i} className={i < position - 1 ? 'is-done' : i === position - 1 ? 'is-now' : ''} />)}
        </span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.id}
          className={`rv__card rv__q rv__q--${card.kind}${card.kind === 'flag' ? ` is-${card.severity}` : ''}`}
          initial={reduce ? false : { opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }}
          transition={spring}
        >
          {card.kind === 'name' && (
            <>
              <p className="rv__q-title">Is the name spelled right?</p>
              <div className="rv__q-big">
                <InlineEdit display={card.value} value={card.value} label="Customer name" onSave={async (v) => { await onSaveName(v); decide(card.id) }} />
              </div>
              <p className="rv__q-hint">Speech recognition is least reliable on names. Tap the name to fix it.</p>
              <div className="rv__q-actions">
                <button ref={setPrimary} className="cta-btn" onClick={() => decide(card.id)}>Looks right</button>
                <button className={`ghost-btn rv__spell${spellPhase === 'listening' ? ' is-on' : ''}`} onClick={onSpell} disabled={spellPhase === 'starting' || spellPhase === 'thinking'}>
                  <MicIcon /> {spellPhase === 'listening' ? 'Listening… tap to finish' : spellPhase === 'thinking' ? 'Updating…' : spellPhase === 'starting' ? 'Opening the microphone…' : 'Say the spelling'}
                </button>
              </div>
            </>
          )}
          {card.kind === 'budget' && (
            <>
              <p className="rv__q-title">Is that per month or per year?</p>
              <p className="rv__q-big">“{card.value}”</p>
              <p className="rv__q-hint">The amount was heard without a unit.</p>
              <div className="rv__q-actions">
                <button ref={setPrimary} className="cta-btn" onClick={() => void onSaveBudget(withUnit(card.value, 'month')).then(() => decide(card.id))}>Per month</button>
                <button className="ghost-btn" onClick={() => void onSaveBudget(withUnit(card.value, 'year')).then(() => decide(card.id))}>Per year</button>
                <button className="rv__link" onClick={onOpenDetails}>Edit</button>
              </div>
            </>
          )}
          {card.kind === 'flag' && (
            <>
              <p className="rv__q-title">{card.severity === 'high' ? 'A promise to put right' : 'Worth rewording'}</p>
              <p className="rv__q-big">“{card.statement}”</p>
              <p className="rv__q-hint">{card.advice} The follow-up draft carries a clarifying sentence.</p>
              <div className="rv__q-actions">
                <button ref={setPrimary} className="cta-btn" onClick={() => decide(card.id)}>Got it</button>
                <button className="rv__link" onClick={() => onShowInText(card.statement)}>Show where I said it</button>
              </div>
            </>
          )}
          {card.kind === 'missing' && (
            <>
              <p className="rv__q-title">{card.label} isn’t captured yet</p>
              <p className="rv__q-big">Worth asking next time, or add it now.</p>
              <div className="rv__q-actions">
                <button ref={setPrimary} className="cta-btn" onClick={() => decide(card.id)}>Not discussed</button>
                <button className="ghost-btn" onClick={onOpenDetails}>Add it</button>
              </div>
            </>
          )}
          {items.length > 1 && <button className="rv__skip" onClick={() => defer(card.id)}>Skip for now</button>}
        </motion.div>
      </AnimatePresence>
      <p className="rv__count" aria-live="polite">{position} of {total}</p>
    </section>
  )
}

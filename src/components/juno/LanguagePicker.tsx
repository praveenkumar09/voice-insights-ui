import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LangId } from '../../api/client'
import { infoOf, type LanguageInfo } from '../../utils/languages'

/** Anything on the page can ask the picker to open (the "Change language" link under the Start button). */
export const OPEN_LANGUAGE_EVENT = 'spark:open-language'

interface Props {
  langs: LanguageInfo[]
  value: LangId
  onChange: (id: LangId) => void
}

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.5-4-9s1.4-6.6 4-9z" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)
const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
)

/**
 * One tidy control for the language Spark speaks. The old row of seven buttons ran out of room on a phone and grew with every language
 * an admin turned on. This is a single button showing the current language; it opens a grid (a popover on a laptop, a bottom sheet on a
 * phone) where each language is shown in its own script with its English name beneath. It scales to any number of languages.
 */
export function LanguagePicker({ langs, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const current = infoOf(value)

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect()
    if (r) setPos({ top: Math.round(r.bottom + 8), right: Math.max(12, Math.round(window.innerWidth - r.right)) })
  }, [])

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }, [])

  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    const ask = () => setOpen(true)
    window.addEventListener(OPEN_LANGUAGE_EVENT, ask)
    return () => window.removeEventListener(OPEN_LANGUAGE_EVENT, ask)
  }, [])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) close(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLButtonElement)
        if (!items.length) return
        e.preventDefault()
        const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1
        items[(i + step + items.length) % items.length].focus()
      }
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', place)
    // focus the chosen language so the keyboard starts where the eye is
    window.setTimeout(() => panel.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus(), 30)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', place)
    }
  }, [open, close, place])

  const pick = (id: LangId) => {
    onChange(id)
    close()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`lp__trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.name}. Change language`}
        onClick={() => setOpen((o) => !o)}
      >
        <GlobeIcon />
        <span className="lp__current">{current.native}</span>
        <span className="lp__chev"><ChevronIcon /></span>
      </button>
      {open && createPortal(
        <div className="lp__layer" data-lp>
          <div className="lp__scrim" onClick={() => close(false)} />
          <div
            ref={panel}
            className="lp__panel"
            role="dialog"
            aria-label="Choose the language Spark speaks"
            style={pos ? { top: pos.top, right: pos.right } : undefined}
          >
            <div className="lp__grab" aria-hidden="true" />
            <div className="lp__head">
              <b>Spark speaks</b>
              <span>Pick the language you will dictate in</span>
            </div>
            <div className="lp__grid" role="listbox" aria-label="Languages">
              {langs.map((l) => {
                const on = l.id === value
                return (
                  <button key={l.id} type="button" role="option" aria-selected={on} className={`lp__opt${on ? ' is-on' : ''}`} onClick={() => pick(l.id)}>
                    <span className="lp__native" lang={l.speech}>{l.native}</span>
                    {l.name !== l.native && <span className="lp__name">{l.name}</span>}
                    {on && <span className="lp__tick"><CheckIcon /></span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

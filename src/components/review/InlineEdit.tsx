import { useEffect, useRef, useState } from 'react'

interface Props {
  /** What is shown when not editing. */
  display: string
  /** What the field holds, and what editing starts from. */
  value: string
  label: string
  numeric?: boolean
  /** Resolves when saved; a rejection shows its message under the field. */
  onSave: (next: string) => Promise<void>
  className?: string
  placeholder?: string
  /** Marks this value as a landing place for the ledger chips that fly in when the review appears. */
  fly?: boolean
}

/**
 * Edit in place: the value is text until tapped, then it becomes a field. Return saves, Escape cancels. There is no separate form, so
 * correcting a name or a number is one tap, one correction, one Return.
 */
export function InlineEdit({ display, value, label, numeric, onSave, className = '', placeholder = 'Add', fly }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  async function commit() {
    const v = draft.trim()
    if (v === value.trim()) return setEditing(false)
    if (!v) return setError('This can’t be empty')
    if (numeric && !Number.isFinite(Number(v))) return setError('Enter a number')
    setBusy(true)
    setError(null)
    try {
      await onSave(v)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <button type="button" data-fly={fly ? '' : undefined} className={`ie ${className}`} onClick={() => { cancelled.current = false; setError(null); setEditing(true) }} aria-label={`Edit ${label}: ${display || 'empty'}`}>
        <span className={display ? '' : 'ie__empty'}>{display || placeholder}</span>
        <i className="ie__pen" aria-hidden>✎</i>
      </button>
    )
  }
  return (
    <span className={`ie ie--editing ${className}`}>
      <input
        ref={input}
        value={draft}
        inputMode={numeric ? 'numeric' : undefined}
        aria-label={label}
        disabled={busy}
        onChange={(e) => { setDraft(e.target.value); setError(null) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit()
          if (e.key === 'Escape') { cancelled.current = true; setEditing(false) }
        }}
        onBlur={() => { if (!busy && !cancelled.current) void commit() }}
      />
      {error && <small className="ie__error" role="alert">{error}</small>}
    </span>
  )
}

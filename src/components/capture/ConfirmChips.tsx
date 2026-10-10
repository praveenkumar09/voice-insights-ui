import { useEffect, useMemo, useState } from 'react'
import { saveCustomerProfile } from '../../api/client'
import type { CustomerProfile } from '../../types'

interface Props {
  profile: CustomerProfile
  onSaved: (p: CustomerProfile) => void
}

type Key = 'customerName' | 'age' | 'occupation' | 'dependents' | 'budgetNotes'

interface Chip {
  key: Key
  label: string
  value: string
  /** Why this one deserves a second look (speech recognition gets these wrong most often). */
  check?: string
}

function chipsFor(p: CustomerProfile): Chip[] {
  const out: Chip[] = []
  if (p.customerName) out.push({ key: 'customerName', label: 'Name', value: p.customerName, check: 'Check the spelling' })
  if (p.age != null) out.push({ key: 'age', label: 'Age', value: String(p.age) })
  if (p.occupation) out.push({ key: 'occupation', label: 'Occupation', value: p.occupation })
  if (p.dependents != null) out.push({ key: 'dependents', label: 'Dependants', value: String(p.dependents) })
  if (p.budgetNotes) {
    const hasUnit = /(month|year|annual|week|per|a )/i.test(p.budgetNotes)
    out.push({ key: 'budgetNotes', label: 'Budget', value: p.budgetNotes, check: hasUnit ? undefined : 'Check the amount and whether it is monthly or yearly' })
  }
  return out
}

/**
 * The names and numbers Juno heard, as chips the advisor can tap to confirm or fix in one go. Speech recognition gets exactly these
 * wrong most often, so this turns a possible silent error into a five-second check. Confirming is optional and never blocks anything.
 */
export function ConfirmChips({ profile, onSaved }: Props) {
  const chips = useMemo(() => chipsFor(profile), [profile])
  const [confirmed, setConfirmed] = useState<Set<Key>>(new Set())
  const [editing, setEditing] = useState<Key | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A different customer (a new debrief) starts with nothing confirmed.
  useEffect(() => setConfirmed(new Set()), [profile.id])

  if (chips.length === 0) return null

  function toggle(k: Key) {
    setConfirmed((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }

  function startEdit(c: Chip) {
    setEditing(c.key)
    setDraft(c.value)
    setError(null)
  }

  async function saveEdit(c: Chip) {
    const v = draft.trim()
    if (!v) return
    setBusy(true)
    setError(null)
    try {
      const patch: Partial<CustomerProfile> =
        c.key === 'age' ? { age: Number(v) } : c.key === 'dependents' ? { dependents: Number(v) } : { [c.key]: v }
      if ((c.key === 'age' || c.key === 'dependents') && !Number.isFinite(Number(v))) throw new Error('Please enter a number')
      const saved = await saveCustomerProfile({ ...profile, ...patch })
      onSaved(saved)
      setConfirmed((s) => new Set(s).add(c.key)) // typing it in is confirming it
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const done = chips.filter((c) => confirmed.has(c.key)).length

  return (
    <div className="glass-card cc" aria-label="Confirm what Juno heard">
      <div className="cc__head">
        <div>
          <div className="glass-card__label">Confirm what Juno heard</div>
          <p className="cc__sub">Tap a chip if it is right, or the pencil to fix it. Speech recognition is least reliable on names and numbers.</p>
        </div>
        <div className="cc__tally">
          <b>{done}</b> of {chips.length} confirmed
          {done < chips.length && (
            <button className="ghost-btn" onClick={() => setConfirmed(new Set(chips.map((c) => c.key)))}>Confirm all</button>
          )}
        </div>
      </div>
      <ul className="cc__chips">
        {chips.map((c) => {
          const ok = confirmed.has(c.key)
          return (
            <li key={c.key} className={`cc__chip${ok ? ' is-ok' : c.check ? ' is-check' : ''}`}>
              {editing === c.key ? (
                <form
                  className="cc__edit"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveEdit(c)
                  }}
                >
                  <span>{c.label}</span>
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Correct ${c.label}`} />
                  <button type="submit" disabled={busy}>{busy ? '…' : 'Save'}</button>
                  <button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                </form>
              ) : (
                <>
                  <button className="cc__main" onClick={() => toggle(c.key)} aria-pressed={ok} title={ok ? 'Confirmed: tap to undo' : c.check ?? 'Tap to confirm'}>
                    <span className="cc__tick" aria-hidden>{ok ? '✓' : ''}</span>
                    <span className="cc__label">{c.label}</span>
                    <b>{c.value}</b>
                    {!ok && c.check && <em>{c.check}</em>}
                  </button>
                  <button className="cc__pencil" onClick={() => startEdit(c)} aria-label={`Fix ${c.label}`} title="Fix this">✎</button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="cc__error">{error}</p>}
    </div>
  )
}

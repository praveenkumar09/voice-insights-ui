import { useEffect, useMemo, useState } from 'react'
import { saveCustomerProfile, type FactFindReadiness } from '../../api/client'
import type { CopilotInsights, CustomerProfile, LifeMapData } from '../../types'
import { duration, entitiesFor, findMarks, MANUAL_MINUTES, type Entity, type EntityKey } from '../../utils/debriefMarks'
import { DebriefFollowUp } from '../capture/DebriefFollowUp'
import { DressRehearsal } from '../rehearsal/DressRehearsal'
import { ReviewPanel } from '../capture/ReviewPanel'
import { JunoTranscript } from './JunoStage'
import type { JunoTurn } from '../../hooks/useJuno'

interface Props {
  profile: CustomerProfile
  copilot: CopilotInsights | null
  segments: string[]
  turns: JunoTurn[]
  readiness: FactFindReadiness | null
  elapsedMs: number | null
  advancing: boolean
  /** Called only for a real click by the advisor (see the approve button). */
  onApprove: () => void
  onBrief: () => void
  onProfileSaved: (p: CustomerProfile) => void
  onSaveLifeMap: (m: LifeMapData) => Promise<void>
  onSaveTranscript: (text: string) => Promise<void>
}

/**
 * The second half of a debrief with Juno: a document the advisor signs off, not a stack of cards. Left: what was said, with the
 * names, numbers and risky promises marked where they were spoken. Right: the facts to confirm, what is still open, and the
 * conduct note. Below: the follow-up as a phone message. One bar holds the only button that starts the analysis.
 */
export function DebriefSignOff({ profile, copilot, segments, turns, readiness, elapsedMs, advancing, onApprove, onBrief, onProfileSaved, onSaveLifeMap, onSaveTranscript }: Props) {
  const entities = useMemo(() => entitiesFor(profile), [profile])
  const flags = copilot?.complianceFlags ?? []
  const [confirmed, setConfirmed] = useState<Set<EntityKey>>(new Set())
  const [focus, setFocus] = useState<string | null>(null)
  const text = segments.join('\n\n')

  // A different customer (a new debrief) starts with nothing confirmed.
  useEffect(() => setConfirmed(new Set()), [profile.id])

  const toggle = (k: EntityKey) =>
    setConfirmed((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const unconfirmed = entities.filter((e) => !confirmed.has(e.key)).length
  const open = readiness ? readiness.total - readiness.captured : null
  const items = [
    unconfirmed > 0 ? `${unconfirmed} to confirm` : entities.length ? 'all confirmed' : null,
    open != null ? (open > 0 ? `${open} fact-find field${open === 1 ? '' : 's'} open` : 'fact-find complete') : null,
    flags.length ? `${flags.length} conduct flag${flags.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean) as string[]

  return (
    <section className="so" id="debrief-signoff" aria-label="Sign off the debrief">
      <div className="so__bar">
        <div className="so__bar-main">
          <span className="so__badge" aria-hidden><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          <div>
            <b>Sign off</b>
            <small>{items.join(' · ') || 'Review what Juno captured'}</small>
          </div>
        </div>
        {elapsedMs != null && (
          <div className="so__time" title={`Planning assumption: a manual write-up takes about ${MANUAL_MINUTES} minutes. To be measured in the July baseline study.`}>
            <b>{duration(elapsedMs)}</b> vs ~{MANUAL_MINUTES} min by hand
          </div>
        )}
        <div className="so__bar-actions">
          <button className="ghost-btn" onClick={onBrief}>Download brief (PDF)</button>
          <button
            className="cta-btn"
            disabled={advancing}
            // A synthetic click (script or automation) is ignored: only a real press by a person counts.
            onClick={(e) => e.isTrusted && onApprove()}
          >
            {advancing ? 'Preparing…' : 'Approve & prepare the pack'}
          </button>
        </div>
      </div>
      <p className="so__lock">Only the advisor can start the analysis. Juno cannot. Confirming is optional and never blocks it.</p>

      <div className="so__grid">
        <MarkedTranscript text={text} entities={entities} flags={flags.map((f) => f.statement)} confirmed={confirmed} focus={focus} onFocus={setFocus} onSave={onSaveTranscript} />
        <div className="so__side">
          <VerifyList profile={profile} entities={entities} confirmed={confirmed} focus={focus} onFocus={setFocus} onToggle={toggle} onConfirmAll={() => setConfirmed(new Set(entities.map((e) => e.key)))} onSaved={(p) => { onProfileSaved(p) }} onConfirm={(k) => setConfirmed((s) => new Set(s).add(k))} />
          <OpenSlots readiness={readiness} />
          {flags.length > 0 && (
            <div className="glass-card so__card so__conduct">
              <div className="glass-card__label">Conduct watch</div>
              {flags.map((f, i) => (
                <button key={i} className={`so__flag so__flag--${f.severity}${focus === `flag:${i}` ? ' is-focus' : ''}`} onClick={() => setFocus(`flag:${i}`)}>
                  <em>{f.severity === 'high' ? 'High risk' : 'Caution'}</em>
                  <q>{f.statement}</q>
                  <span>{f.advice}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <DebriefFollowUp key={profile.id} profileId={profile.id!} customerName={profile.customerName ?? ''} />

      <DressRehearsal key={profile.id} profileId={profile.id!} customerName={profile.customerName ?? ''} />

      {turns.length > 0 && (
        <details className="so__more">
          <summary>The conversation with Juno</summary>
          <JunoTranscript turns={turns} />
        </details>
      )}
      <details className="so__more">
        <summary>Edit details and the Life Map</summary>
        <ReviewPanel profile={profile} copilot={copilot} onProfileSaved={onProfileSaved} onSaveLifeMap={onSaveLifeMap} />
      </details>
    </section>
  )
}

/** What the advisor said, with each name, number and risky promise marked where it was spoken. Tapping a mark points to its card. */
function MarkedTranscript({ text, entities, flags, confirmed, focus, onFocus, onSave }: {
  text: string
  entities: Entity[]
  flags: string[]
  confirmed: Set<EntityKey>
  focus: string | null
  onFocus: (f: string | null) => void
  onSave: (t: string) => Promise<void>
}) {
  const marks = useMemo(() => findMarks(text, entities, flags), [text, entities, flags])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parts: React.ReactNode[] = []
  let at = 0
  marks.forEach((m, i) => {
    if (m.start > at) parts.push(text.slice(at, m.start))
    const body = text.slice(m.start, m.end)
    if (m.kind === 'entity') {
      const e = entities.find((x) => x.key === m.ref)!
      const ok = confirmed.has(e.key)
      parts.push(
        <mark key={i} className={`so__mark${ok ? ' is-ok' : e.check ? ' is-check' : ''}${focus === `entity:${e.key}` ? ' is-focus' : ''}`} tabIndex={0} title={`${e.label}${ok ? ' (confirmed)' : e.check ? `: ${e.check}` : ''}`} onClick={() => onFocus(`entity:${e.key}`)} onKeyDown={(ev) => ev.key === 'Enter' && onFocus(`entity:${e.key}`)}>
          {body}
        </mark>,
      )
    } else {
      parts.push(
        <mark key={i} className={`so__mark so__mark--flag${focus === `flag:${m.ref}` ? ' is-focus' : ''}`} tabIndex={0} title="Risky statement: see the conduct watch" onClick={() => onFocus(`flag:${m.ref}`)} onKeyDown={(ev) => ev.key === 'Enter' && onFocus(`flag:${m.ref}`)}>
          {body}
        </mark>,
      )
    }
    at = m.end
  })
  if (at < text.length) parts.push(text.slice(at))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the transcript')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card so__card so__doc">
      <div className="so__doc-head">
        <div className="glass-card__label">What you said</div>
        <span className="so__legend"><i className="is-check" />check<i className="is-ok" />confirmed<i className="is-flag" />risky promise</span>
        {!editing && text && <button className="transcript-panel__edit-btn" onClick={() => { setDraft(text); setError(null); setEditing(true) }}>✎ Edit transcript</button>}
      </div>
      {editing ? (
        <div className="transcript-edit">
          <textarea className="transcript-edit__area" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={saving} autoFocus spellCheck />
          <p className="transcript-edit__hint">Fix any mis-heard words. Saving re-analyses the conversation: the profile, ledger and follow-up update.</p>
          {error && <p className="transcript-edit__error">{error}</p>}
          <div className="transcript-edit__actions">
            <button className="ghost-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button className="cta-btn transcript-edit__save" onClick={save} disabled={saving || !draft.trim()}>{saving ? 'Re-analysing…' : 'Save & update'}</button>
          </div>
        </div>
      ) : (
        <div className="so__text">{text ? parts : <span className="panel-empty">Nothing was transcribed.</span>}</div>
      )}
    </div>
  )
}

/** The names and numbers Juno heard, to confirm or fix in one tap. Speech recognition is least reliable on exactly these. */
function VerifyList({ profile, entities, confirmed, focus, onFocus, onToggle, onConfirmAll, onSaved, onConfirm }: {
  profile: CustomerProfile
  entities: Entity[]
  confirmed: Set<EntityKey>
  focus: string | null
  onFocus: (f: string | null) => void
  onToggle: (k: EntityKey) => void
  onConfirmAll: () => void
  onSaved: (p: CustomerProfile) => void
  onConfirm: (k: EntityKey) => void
}) {
  const [editing, setEditing] = useState<EntityKey | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveEdit(e: Entity) {
    const v = draft.trim()
    if (!v) return
    setBusy(true)
    setError(null)
    try {
      if ((e.key === 'age' || e.key === 'dependents') && !Number.isFinite(Number(v))) throw new Error('Please enter a number')
      const patch: Partial<CustomerProfile> = e.key === 'age' ? { age: Number(v) } : e.key === 'dependents' ? { dependents: Number(v) } : { [e.key]: v }
      onSaved(await saveCustomerProfile({ ...profile, ...patch }))
      onConfirm(e.key) // typing it in is confirming it
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  if (entities.length === 0) return null
  const done = entities.filter((e) => confirmed.has(e.key)).length
  return (
    <div className="glass-card so__card" aria-label="Confirm what Juno heard">
      <div className="so__card-head">
        <div className="glass-card__label">Confirm what Juno heard</div>
        <span className="so__tally"><b>{done}</b>/{entities.length}{done < entities.length && <button className="so__link" onClick={onConfirmAll}>Confirm all</button>}</span>
      </div>
      <ul className="so__facts">
        {entities.map((e) => {
          const ok = confirmed.has(e.key)
          return (
            <li key={e.key} className={`so__fact${ok ? ' is-ok' : e.check ? ' is-check' : ''}${focus === `entity:${e.key}` ? ' is-focus' : ''}`}>
              {editing === e.key ? (
                <form className="so__edit" onSubmit={(ev) => { ev.preventDefault(); void saveEdit(e) }}>
                  <span>{e.label}</span>
                  <input autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} aria-label={`Correct ${e.label}`} />
                  <button type="submit" disabled={busy}>{busy ? '…' : 'Save'}</button>
                  <button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                </form>
              ) : (
                <>
                  <button className="so__fact-main" onClick={() => { onToggle(e.key); onFocus(`entity:${e.key}`) }} aria-pressed={ok} title={ok ? 'Confirmed: tap to undo' : e.check ?? 'Tap to confirm'}>
                    <span className="so__tick" aria-hidden>{ok ? '✓' : ''}</span>
                    <span className="so__fact-label">{e.label}</span>
                    <b>{e.value}</b>
                    {!ok && e.check && <em>{e.check}</em>}
                  </button>
                  <button className="so__pencil" onClick={() => { setEditing(e.key); setDraft(e.value); setError(null) }} aria-label={`Fix ${e.label}`} title="Fix this">✎</button>
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

/** The fact-find fields the debrief did not capture, most valuable first: open slots rather than a score. */
function OpenSlots({ readiness }: { readiness: FactFindReadiness | null }) {
  if (!readiness || readiness.missing.length === 0) return null
  return (
    <div className="glass-card so__card">
      <div className="so__card-head">
        <div className="glass-card__label">Still open in the fact-find</div>
        <span className="so__tally"><b>{readiness.captured}</b>/{readiness.total} captured</span>
      </div>
      <ul className="so__slots">
        {readiness.missing.slice(0, 8).map((m) => <li key={m}>{m}</li>)}
        {readiness.missing.length > 8 && <li className="is-more">+{readiness.missing.length - 8} more</li>}
      </ul>
      <p className="so__hint">Add these in the details below, or leave them for the next meeting. An estimate: the pack makes the final count.</p>
    </div>
  )
}

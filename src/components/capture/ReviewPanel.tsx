import { useEffect, useState } from 'react'
import { saveCustomerProfile } from '../../api/client'
import type { CopilotInsights, CustomerProfile, LifeMapConcern, LifeMapData, LifeMapPerson } from '../../types'

const RELATIONS = ['Wife', 'Husband', 'Partner', 'Daughter', 'Son', 'Child', 'Mother', 'Father', 'Parent', 'Sibling', 'Other']
const ADDED = 'Added by the advisor'

interface Props {
  profile: CustomerProfile
  copilot: CopilotInsights | null
  onProfileSaved: (p: CustomerProfile) => void
  onSaveLifeMap: (m: LifeMapData) => Promise<void>
}

/**
 * The step between dictating and analysing: the advisor checks what was understood, fills in anything that was
 * missed, and corrects the Life Map. Nothing here is required — but the agents work from exactly what is
 * confirmed on this screen.
 */
export function ReviewPanel({ profile, copilot, onProfileSaved, onSaveLifeMap }: Props) {
  const missing = [profile.age, profile.occupation, profile.incomeBand, profile.dependents, profile.budgetNotes]
    .filter((v) => v == null || String(v).trim() === '').length + ((profile.existingPolicies ?? []).length === 0 ? 1 : 0)
  return (
    <div className="review">
      <div className="review__head">
        <div>
          <h3>Review before analysis</h3>
          <p>Check what was understood, add anything missing, and correct the map. The agents work from what you confirm here.</p>
        </div>
        <span className={`review__pill${missing === 0 ? ' is-ok' : ''}`}>
          {missing === 0 ? 'All details captured' : `${missing} detail${missing === 1 ? '' : 's'} still missing`}
        </span>
      </div>
      <div className="review__grid">
        <DetailsForm profile={profile} onSaved={onProfileSaved} />
        <LifeMapEditor map={copilot?.lifeMap ?? null} onSave={onSaveLifeMap} />
      </div>
    </div>
  )
}

function DetailsForm({ profile, onSaved }: { profile: CustomerProfile; onSaved: (p: CustomerProfile) => void }) {
  const initial = () => ({
    customerName: profile.customerName ?? '',
    age: profile.age != null ? String(profile.age) : '',
    occupation: profile.occupation ?? '',
    incomeBand: profile.incomeBand ?? '',
    dependents: profile.dependents != null ? String(profile.dependents) : '',
    budgetNotes: profile.budgetNotes ?? '',
    existingPolicies: (profile.existingPolicies ?? []).join(', '),
  })
  const [f, setF] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Fresh extraction results (e.g. after a transcript edit) replace the form.
  useEffect(() => setF(initial()), [profile.customerName, profile.age, profile.occupation, profile.incomeBand, profile.dependents, profile.budgetNotes, profile.existingPolicies]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }))
    setMsg(null)
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const saved = await saveCustomerProfile({
        ...profile,
        customerName: f.customerName.trim() || null,
        age: f.age.trim() ? Number(f.age) : null,
        occupation: f.occupation.trim() || null,
        incomeBand: f.incomeBand.trim() || null,
        dependents: f.dependents.trim() ? Number(f.dependents) : null,
        budgetNotes: f.budgetNotes.trim() || null,
        existingPolicies: f.existingPolicies.split(',').map((x) => x.trim()).filter(Boolean),
      })
      onSaved(saved)
      setMsg('Saved')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof f, opts: { type?: string; placeholder?: string; wide?: boolean } = {}) => (
    <label className={`review__field${opts.wide ? ' is-wide' : ''}${f[key].trim() === '' ? ' is-missing' : ''}`}>
      <span>
        {label}
        {f[key].trim() === '' && <em>missing</em>}
      </span>
      <input type={opts.type ?? 'text'} value={f[key]} onChange={set(key)} placeholder={opts.placeholder} />
    </label>
  )

  return (
    <div className="glass-card review__card">
      <CardHead step={1} title="Customer details" hint="What the agents understood about them" />
      <div className="review__fields">
        {field('Name', 'customerName')}
        {field('Age', 'age', { type: 'number' })}
        {field('Occupation', 'occupation')}
        {field('Income', 'incomeBand', { placeholder: 'e.g. S$6,000–8,000 / month' })}
        {field('Dependants', 'dependents', { type: 'number' })}
        {field('Budget', 'budgetNotes', { placeholder: 'e.g. around S$400 a month' })}
        {field('Existing cover', 'existingPolicies', { placeholder: 'Comma-separated, or leave blank if none', wide: true })}
      </div>
      <div className="review__tip">
        <b>Why it matters</b>
        Age, budget and existing cover are what let the agents size the cover and avoid recommending what the customer already has.
      </div>
      <div className="review__actions">
        <span className="review__note">Optional — blanks are fine</span>
        {msg && <span className={`review__msg${msg === 'Saved' ? ' is-ok' : ''}`}>{msg}</span>}
        <button className="ghost-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </div>
  )
}

function LifeMapEditor({ map, onSave }: { map: LifeMapData | null; onSave: (m: LifeMapData) => Promise<void> }) {
  const [draft, setDraft] = useState<LifeMapData>(map ?? { people: [], dreams: [], worries: [] })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Adopt a fresh server map (re-analysis) unless the advisor is mid-edit.
  useEffect(() => {
    if (!dirty && map) setDraft(map)
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  const [rel, setRel] = useState('Wife')
  const [pname, setPname] = useState('')
  const [hope, setHope] = useState('')
  const [hopeFor, setHopeFor] = useState('Self')
  const [concern, setConcern] = useState('')
  const [concernFor, setConcernFor] = useState('Self')

  const change = (next: LifeMapData) => {
    setDraft(next)
    setDirty(true)
    setError(null)
  }
  const forOptions = ['Self', ...draft.people.map((p) => p.relation)]

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the Life Map')
    } finally {
      setSaving(false)
    }
  }

  const chip = (text: string, sub: string | undefined, onRemove: () => void) => (
    <li className="lme__chip" key={text + (sub ?? '')}>
      <span>
        {text}
        {sub && <small>{sub}</small>}
      </span>
      <button onClick={onRemove} aria-label={`Remove ${text}`}>×</button>
    </li>
  )

  return (
    <div className="glass-card review__card">
      <CardHead step={2} title="Correct the Life Map" hint="The people, hopes and concerns on the map" />

      <div className="lme">
        <div className="lme__group lme__group--person">
          <h5><i><PersonGlyph /></i>People<b>{draft.people.length}</b></h5>
          <ul>
            {draft.people.map((p: LifeMapPerson, i) => chip(p.name ?? p.relation, p.name ? p.relation : undefined, () => change({ ...draft, people: draft.people.filter((_, j) => j !== i) })))}
            {draft.people.length === 0 && <li className="lme__none">No one yet</li>}
          </ul>
          <div className="lme__add">
            <input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="Name (optional)" aria-label="Name" />
            <select value={rel} onChange={(e) => setRel(e.target.value)} aria-label="Relationship">{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select>
            <button className="ghost-btn" onClick={() => { change({ ...draft, people: [...draft.people, { relation: rel, name: pname.trim() || null, said: ADDED }] }); setPname('') }}>Add</button>
          </div>
        </div>

        <div className="lme__group lme__group--dream">
          <h5><i>✦</i>Hopes<b>{draft.dreams.length}</b></h5>
          <ul>
            {draft.dreams.map((c: LifeMapConcern, i) => chip(c.label, c.forRelation !== 'Self' ? `for ${c.forRelation.toLowerCase()}` : undefined, () => change({ ...draft, dreams: draft.dreams.filter((_, j) => j !== i) })))}
            {draft.dreams.length === 0 && <li className="lme__none">None yet</li>}
          </ul>
          <div className="lme__add">
            <input value={hope} onChange={(e) => setHope(e.target.value)} placeholder="e.g. Children's university" aria-label="Hope" />
            <select value={hopeFor} onChange={(e) => setHopeFor(e.target.value)} aria-label="Hope is for">{forOptions.map((r) => <option key={r}>{r}</option>)}</select>
            <button className="ghost-btn" disabled={!hope.trim()} onClick={() => { change({ ...draft, dreams: [...draft.dreams, { label: hope.trim(), forRelation: hopeFor, said: ADDED, idea: null }] }); setHope('') }}>Add</button>
          </div>
        </div>

        <div className="lme__group lme__group--worry">
          <h5><i>!</i>Concerns<b>{draft.worries.length}</b></h5>
          <ul>
            {draft.worries.map((c: LifeMapConcern, i) => chip(c.label, c.forRelation !== 'Self' ? `for ${c.forRelation.toLowerCase()}` : undefined, () => change({ ...draft, worries: draft.worries.filter((_, j) => j !== i) })))}
            {draft.worries.length === 0 && <li className="lme__none">None yet</li>}
          </ul>
          <div className="lme__add">
            <input value={concern} onChange={(e) => setConcern(e.target.value)} placeholder="e.g. Father's diabetes" aria-label="Concern" />
            <select value={concernFor} onChange={(e) => setConcernFor(e.target.value)} aria-label="Concern is for">{forOptions.map((r) => <option key={r}>{r}</option>)}</select>
            <button className="ghost-btn" disabled={!concern.trim()} onClick={() => { change({ ...draft, worries: [...draft.worries, { label: concern.trim(), forRelation: concernFor, said: ADDED, idea: null }] }); setConcern('') }}>Add</button>
          </div>
        </div>
      </div>

      <div className="review__actions">
        {error ? <span className="review__msg">{error}</span> : <span className="review__note">{dirty ? 'You have unsaved changes' : 'Matches what the agents will use'}</span>}
        <button className={dirty ? 'cta-btn review__save' : 'ghost-btn'} onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : dirty ? 'Save map changes' : 'Map is up to date'}
        </button>
      </div>
    </div>
  )
}

function CardHead({ step, title, hint }: { step: number; title: string; hint: string }) {
  return (
    <div className="review__card-head">
      <span className="review__step">{step}</span>
      <div>
        <div className="review__card-title">{title}</div>
        <div className="review__card-hint">{hint}</div>
      </div>
    </div>
  )
}

function PersonGlyph() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="13" r="7" />
      <path d="M6 37c0-9 6-15 14-15s14 6 14 15z" />
    </svg>
  )
}

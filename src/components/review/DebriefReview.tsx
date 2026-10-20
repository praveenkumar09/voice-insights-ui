import { TheirWorld } from '../lifemap/TheirWorld'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { junoCorrection, saveCustomerProfile, type FactFindReadiness, type SpokenCorrection } from '../../api/client'
import { speakShort, useVoiceCommand } from '../../hooks/useVoiceCommand'
import type { JunoTurn } from '../../hooks/useJuno'
import type { CopilotInsights, CustomerProfile, LifeMapData } from '../../types'
import { duration, entitiesFor, findMarks, MANUAL_MINUTES, type Entity } from '../../utils/debriefMarks'
import { flyIn } from '../../utils/flyIn'
import { MicIcon } from '../icons'
import { useJunoAction, useJunoScreen } from '../juno/mode/JunoMode'
import { ReviewPanel } from '../capture/ReviewPanel'
import { JunoTranscript } from '../juno/JunoStage'
import { DressRehearsal } from '../rehearsal/DressRehearsal'
import { ExceptionStack, type Exception } from './ExceptionStack'
import { InlineEdit } from './InlineEdit'

interface Props {
  profile: CustomerProfile
  copilot: CopilotInsights | null
  segments: string[]
  turns: JunoTurn[]
  readiness: FactFindReadiness | null
  elapsedMs: number | null
  advancing: boolean
  /** Called only for a real click by the advisor (see the approve buttons). */
  onApprove: () => void
  onBrief: () => void
  onProfileSaved: (p: CustomerProfile) => void
  onSaveLifeMap: (m: LifeMapData) => Promise<void>
  onSaveTranscript: (text: string) => Promise<void>
  /** The Life Map, shown under Details so the first screen stays calm. */
  lifeMap: ReactNode
}

type Tab = 'summary' | 'rehearse' | 'details'

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'rehearse', label: 'Rehearse' },
  { id: 'details', label: 'Details' },
]

/**
 * The page after a debrief with Juno, in three levels. A glance: who the customer is, in five seconds. A review: only the few things
 * that need a person, one card at a time. The details: every field, the Life Map and the transcript, one tap away. One button at the
 * bottom changes with where the advisor is, and only a real click by a person can approve.
 */
export function DebriefReview({ profile, copilot, segments, turns, readiness, elapsedMs, advancing, onApprove, onBrief, onProfileSaved, onSaveLifeMap, onSaveTranscript }: Props) {
  const reduce = useReducedMotion()
  const [tab, setTab] = useState<Tab>('summary')
  // The Life map as the advisor is editing it, shown on the map before it is saved.
  const [draftMap, setDraftMap] = useState<LifeMapData | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<string[]>([])
  const [focus, setFocus] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const stackRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const voice = useVoiceCommand()
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const [applying, setApplying] = useState(false)
  const text = segments.join('\n\n')
  const entities = useMemo(() => entitiesFor(profile), [profile])
  const flags = copilot?.complianceFlags ?? []

  // A different customer (a new debrief) starts fresh.
  useEffect(() => {
    setResolved(new Set())
    setSkipped([])
    setFocus(null)
    setTab('summary')
    setShowAll(false)
  }, [profile.id])

  // The facts the ledger showed fly into place the first time this page appears for a customer.
  useLayoutEffect(() => {
    flyIn(rootRef.current, !!reduce)
  }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 9000)
    return () => window.clearTimeout(t)
  }, [toast])

  const save = async (patch: Partial<CustomerProfile>) => onProfileSaved(await saveCustomerProfile({ ...profile, ...patch }))
  const saveName = (v: string) => save({ customerName: v })
  const saveBudget = (v: string) => save({ budgetNotes: v })

  // What needs a person: a name to spell-check, an amount without a unit, a risky promise, the most valuable missing fact.
  const exceptions = useMemo<Exception[]>(() => {
    const out: Exception[] = []
    if (profile.customerName) out.push({ id: 'name', kind: 'name', value: profile.customerName })
    const budget = entities.find((e) => e.key === 'budgetNotes')
    if (budget?.check) out.push({ id: 'budget', kind: 'budget', value: budget.value })
    flags.forEach((f, i) => out.push({ id: `flag:${i}`, kind: 'flag', statement: f.statement, advice: f.advice, severity: f.severity === 'high' ? 'high' : 'caution' }))
    const miss = readiness?.missing?.[0]
    if (miss) out.push({ id: 'missing', kind: 'missing', label: miss })
    return out
  }, [profile.customerName, entities, flags, readiness])

  const pending = exceptions.filter((e) => !resolved.has(e.id))
  const queue = useMemo(() => {
    const fresh = pending.filter((e) => !skipped.includes(e.id))
    const later = skipped.map((id) => pending.find((e) => e.id === id)).filter(Boolean) as Exception[]
    const ordered = [...fresh, ...later]
    const f = focus ? ordered.find((e) => e.id === focus) : null
    return f ? [f, ...ordered.filter((e) => e !== f)] : ordered
  }, [pending, skipped, focus])

  const resolve = (id: string) => {
    setResolved((s) => new Set(s).add(id))
    setSkipped((s) => s.filter((x) => x !== id))
    setFocus((f) => (f === id ? null : f))
  }
  const skip = (id: string) => {
    setSkipped((s) => [...s.filter((x) => x !== id), id])
    setFocus((f) => (f === id ? null : f))
  }

  const patchFor = (f: SpokenCorrection['field'], value: string): Partial<CustomerProfile> =>
    f === 'customerName' ? { customerName: value } : f === 'age' ? { age: Number(value) } : f === 'occupation' ? { occupation: value }
      : f === 'dependents' ? { dependents: Number(value) } : f === 'budgetNotes' ? { budgetNotes: value } : {}
  const currentFor = (f: SpokenCorrection['field']): Partial<CustomerProfile> =>
    f === 'customerName' ? { customerName: profile.customerName } : f === 'age' ? { age: profile.age } : f === 'occupation' ? { occupation: profile.occupation }
      : f === 'dependents' ? { dependents: profile.dependents } : f === 'budgetNotes' ? { budgetNotes: profile.budgetNotes } : {}

  /** What the advisor said, turned into one change: applied with a plain-words confirmation and an Undo. */
  async function applySpoken(text: string, asSpelling: boolean): Promise<string> {
    setApplying(true)
    try {
      const r = await junoCorrection(profile.id!, asSpelling ? `The customer's name is spelled: ${text}` : text)
      if (r.field === 'none') {
        setToast({ text: r.say })
        return r.say
      }
      const before = currentFor(r.field)
      await save(patchFor(r.field, r.value))
      if (r.field === 'customerName') resolve('name')
      setToast({ text: r.say, undo: () => void save(before).then(() => setToast({ text: 'Undone.' })) })
      return r.say
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not apply that.'
      setToast({ text: msg })
      return msg
    } finally {
      setApplying(false)
    }
  }
  async function talk(asSpelling: boolean) {
    if (voice.phase === 'listening') return void voice.stop()
    if (voice.phase !== 'idle' || applying) return
    setToast(null)
    const text = await voice.listen()
    if (!text) return setToast({ text: 'I didn’t hear anything. Tap the microphone and try again.' })
    void speakShort(await applySpoken(text, asSpelling))
  }
  const micBusy = voice.phase === 'starting' || voice.phase === 'thinking' || applying

  const wants = (copilot?.lifeMap?.dreams ?? []).slice(0, 2).map((d) => d.label)
  const worries = (copilot?.lifeMap?.worries ?? []).slice(0, 2).map((w) => w.label)
  const initial = (profile.customerName?.trim()[0] ?? '?').toUpperCase()

  function reviewNow() {
    setTab('summary')
    window.setTimeout(() => stackRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }), 60)
  }
  const approve = (e: React.MouseEvent) => {
    // A synthetic click (script or automation) is ignored: only a real press by a person counts.
    if (e.isTrusted) onApprove()
  }

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 38 }

  // What Juno can do on this page.
  const TAB_BY_NAME: Record<string, Tab> = { summary: 'summary', rehearse: 'rehearse', details: 'details' }
  useJunoScreen(`The debrief review for ${profile.customerName ?? 'the customer'}, ${tab} tab${queue.length ? `, ${queue.length} thing${queue.length === 1 ? '' : 's'} to check` : ', everything checked'}`)
  useJunoAction({ id: 'open_tab', description: 'Open a tab: Summary, Rehearse, or Details', risk: 'open', params: { tab: { type: 'enum', values: Object.keys(TAB_BY_NAME) } }, run: (p) => { setTab(TAB_BY_NAME[p.tab]) } })
  useJunoAction(queue.length > 0 ? { id: 'review_items', description: 'Go through the things to check', risk: 'open', run: () => { reviewNow() } } : null)
  useJunoAction({
    id: 'read_summary', description: 'Read out the summary of this customer', risk: 'info',
    run: () => {
      const bits = [profile.customerName, profile.age != null ? `${profile.age} years old` : null, profile.occupation, profile.dependents != null ? `${profile.dependents} dependant${profile.dependents === 1 ? '' : 's'}` : null].filter(Boolean).join(', ')
      return [bits, wants.length ? `Wants ${wants.join(' and ')}.` : '', worries.length ? `Worried about ${worries.join(' and ')}.` : '', profile.budgetNotes ? `Budget: ${profile.budgetNotes.replace(/[.\s]+$/, '')}.` : ''].filter(Boolean).join('. ').replace(/\.\./g, '.')
    },
  })
  useJunoAction({
    id: 'show_approve', description: 'Show me the Approve button', risk: 'guide',
    run: () => {
      const btn = document.querySelector<HTMLElement>('.rv__bar .cta-btn, .rv__bar .rv__link')
      document.querySelector('.rv__dock')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      document.querySelector('.rv__bar')?.animate([{ boxShadow: '0 0 0 0 rgba(211,17,69,0.55)' }, { boxShadow: '0 0 0 14px rgba(211,17,69,0)' }], { duration: 1300, iterations: 2 })
      btn?.focus({ preventScroll: true })
      return `${queue.length ? `${queue.length} thing${queue.length === 1 ? ' is' : 's are'} still to check, but you can approve anyway. ` : ''}Press Approve when you’re ready. I can’t press it for you.`
    },
  })
  // "Hey Juno, add Ethan as his son": adds the person to the Life map and saves it (Juno asks for a yes first, as it changes the record).
  const RELATIVES = ['wife', 'husband', 'partner', 'daughter', 'son', 'child', 'mother', 'father', 'parent', 'sibling', 'other']
  useJunoAction({
    id: 'add_person', description: 'Add a family member to the life map and save it, by name and relationship (wife, husband, son, daughter, mother, father, sibling…)', risk: 'change',
    params: { name: { type: 'string' }, relationship: { type: 'enum', values: RELATIVES } },
    run: async (p) => {
      const name = (p.name ?? '').trim()
      const relation = RELATIVES.includes((p.relationship ?? '').toLowerCase()) ? p.relationship.toLowerCase() : 'other'
      const rel = relation.charAt(0).toUpperCase() + relation.slice(1)
      if (!name) return 'I didn’t catch the name, so I haven’t added anyone.'
      const base = draftMap ?? copilot?.lifeMap ?? { people: [], dreams: [], worries: [] }
      if (base.people.some((x) => (x.name ?? '').toLowerCase() === name.toLowerCase() && x.relation.toLowerCase() === relation)) return `${name} is already on the map.`
      await onSaveLifeMap({ ...base, people: [...base.people, { relation: rel, name, said: 'Added by the advisor' }] })
      return `Added ${name} as ${relation} and saved the map.`
    },
  })
  // "Hey Juno, the income is six thousand a month": fills in or changes one customer detail and saves it (after a yes).
  useJunoAction({
    id: 'set_detail', risk: 'change', params: { field: { type: 'enum', values: ['income', 'budget', 'existing_cover', 'age', 'occupation', 'dependants'] }, value: { type: 'string' } },
    description: 'Fill in or change a customer detail and save it: income, budget, existing cover, age, occupation or dependants',
    run: async (p) => {
      const value = (p.value ?? '').trim()
      if (!value) return 'I didn’t catch the value, so I haven’t changed anything.'
      const num = Number(value.replace(/[^0-9.]/g, ''))
      const patch: Partial<CustomerProfile> =
        p.field === 'income' ? { incomeBand: value }
        : p.field === 'budget' ? { budgetNotes: value }
        : p.field === 'existing_cover' ? { existingPolicies: value.split(/,| and /i).map((x) => x.trim()).filter(Boolean) }
        : p.field === 'occupation' ? { occupation: value }
        : p.field === 'age' && num > 0 ? { age: num }
        : p.field === 'dependants' && num >= 0 ? { dependents: num }
        : {}
      if (Object.keys(patch).length === 0) return 'I couldn’t use that value, so I haven’t changed anything.'
      await save(patch)
      return `Saved ${p.field.replace('_', ' ')}: ${value}.`
    },
  })
  useJunoAction({
    id: 'correct_record', description: 'Change a detail: the name, age, job, dependants or budget', risk: 'change',
    params: { instruction: { type: 'string' } },
    run: (p) => applySpoken(p.instruction, false),
  })

  return (
    <section ref={rootRef} className="rv" id="debrief-signoff" aria-label="Review the debrief">
      {/* Level 1: the glance */}
      <header className="rv__glance">
        <span className="rv__glow rv__glow--a" aria-hidden />
        <span className="rv__glow rv__glow--b" aria-hidden />
        <span className="rv__avatar" aria-hidden>{initial}</span>
        <div className="rv__who">
          <span className="rv__eyebrow">Debrief with Juno</span>
          <InlineEdit className="rv__name" display={profile.customerName ?? ''} value={profile.customerName ?? ''} label="Customer name" placeholder="Add a name" onSave={saveName} fly />
          <div className="rv__meta">
            <InlineEdit display={profile.age != null ? `${profile.age} years old` : ''} value={profile.age != null ? String(profile.age) : ''} label="Age" numeric placeholder="Add age" onSave={(v) => save({ age: Number(v) })} fly />
            <i aria-hidden>·</i>
            <InlineEdit display={profile.occupation ?? ''} value={profile.occupation ?? ''} label="Occupation" placeholder="Add occupation" onSave={(v) => save({ occupation: v })} fly />
            <i aria-hidden>·</i>
            <InlineEdit display={profile.dependents != null ? `${profile.dependents} dependant${profile.dependents === 1 ? '' : 's'}` : ''} value={profile.dependents != null ? String(profile.dependents) : ''} label="Dependants" numeric placeholder="Add dependants" onSave={(v) => save({ dependents: Number(v) })} />
          </div>
          <div className="rv__chips">
            {wants.length > 0 && <span className="rv__chip"><b>Wants</b>{wants.flatMap((w, i) => [i ? ', ' : '', <span key={w} data-fly="">{w}</span>])}</span>}
            {worries.length > 0 && <span className="rv__chip"><b>Worried about</b>{worries.flatMap((w, i) => [i ? ', ' : '', <span key={w} data-fly="">{w}</span>])}</span>}
            {profile.budgetNotes && (
              <span className="rv__chip rv__chip--edit">
                <b>Budget</b>
                <InlineEdit display={profile.budgetNotes.replace(/[.\s]+$/, '').replace(/^budget( is| of| around)?\s+/i, '')} value={profile.budgetNotes} label="Budget" onSave={saveBudget} />
              </span>
            )}
          </div>
          {voice.phase === 'listening' && voice.caption && <p className="rv__caption" aria-live="polite">“{voice.caption}”</p>}
        </div>
        <div className="rv__side">
          <button className={`rv__mic${voice.phase === 'listening' ? ' is-on' : ''}`} onClick={() => void talk(false)} disabled={micBusy}
            title="Say a correction, for example “make that a monthly budget” or “her age is 39”">
            <MicIcon />
            <span>{voice.phase === 'listening' ? 'Listening… tap to finish' : voice.phase === 'thinking' || applying ? 'Updating…' : voice.phase === 'starting' ? 'Opening the microphone…' : 'Say a correction'}</span>
          </button>
        </div>
        {/* The numbers that matter at a glance, before anything is opened */}
        <div className="rv__stats">
          {readiness && (
            <button type="button" className="rv__stat rv__stat--btn" onClick={() => setTab('details')} title="See every field and what is still open">
              <small>Fact-find</small>
              <strong>{readiness.captured}<em>/{readiness.total}</em></strong>
              <span>{readiness.total - readiness.captured > 0 ? `${readiness.total - readiness.captured} still open` : 'Complete'}</span>
            </button>
          )}
          <div className={`rv__stat${queue.length > 0 ? ' is-warn' : ' is-ok'}`}>
            <small>To check</small>
            <strong>{queue.length > 0 ? queue.length : '✓'}</strong>
            <span>{queue.length > 0 ? 'before you approve' : 'All clear'}</span>
          </div>
          {elapsedMs != null && (
            <div className="rv__stat rv__time" title={`Planning assumption: a manual write-up takes about ${MANUAL_MINUTES} minutes. To be measured in the pilot.`}>
              <small>Time with Juno</small>
              <strong>{duration(elapsedMs)}</strong>
              <span>vs about {MANUAL_MINUTES} min by hand</span>
            </div>
          )}
        </div>
      </header>

      {/* Level 2 and 3: a segmented control, not a long scroll */}
      <LayoutGroup id="rv-tabs">
        <div className="rv__tabs" role="tablist" aria-label="Debrief sections"
          onKeyDown={(e) => {
            const i = TABS.findIndex((t) => t.id === tab)
            if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length].id)
            if (e.key === 'ArrowLeft') setTab(TABS[(i + TABS.length - 1) % TABS.length].id)
          }}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" id={`rv-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`rv-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {tab === t.id && <motion.span layoutId="rv-tab-pill" className="rv__tab-pill" transition={spring} />}
              <span className="rv__tab-label">{t.label}{t.id === 'summary' && queue.length > 0 && <em aria-label={`${queue.length} to check`}>{queue.length}</em>}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} role="tabpanel" id={`rv-panel-${tab}`} aria-labelledby={`rv-tab-${tab}`} className="rv__panel"
          initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {tab === 'summary' && (
            <>
              <div ref={stackRef}>
                <ExceptionStack items={queue} total={Math.max(exceptions.length, 1)} onResolve={resolve} onSkip={skip} onSaveName={saveName} onSaveBudget={saveBudget} onOpenDetails={() => setTab('details')}
                  onSpell={() => void talk(true)} spellPhase={applying ? 'thinking' : voice.phase}
                  onShowInText={(s) => { setShowAll(true); const i = flags.findIndex((f) => f.statement === s); setFocus(null); document.getElementById(`rv-mark-flag-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} />
              </div>
              <TheirWorld customerName={profile.customerName} lifeMap={draftMap ?? copilot?.lifeMap} />
              <div className="rv__card rv__said">
                <div className="rv__card-head">
                  <h3>What you said</h3>
                  <button className="rv__link" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>{showAll ? 'Show less' : 'Show all'}</button>
                </div>
                <MarkedText text={text} entities={entities} flags={flags.map((f) => f.statement)} resolved={resolved} clamp={!showAll} />
              </div>
              <div className="rv__foot">
                <button className="rv__link" onClick={onBrief}>Download brief (PDF)</button>
              </div>
            </>
          )}
          {tab === 'rehearse' && <DressRehearsal key={profile.id} profileId={profile.id!} customerName={profile.customerName ?? ''} />}
          {tab === 'details' && (
            <div className="rv__details">
              <ReviewPanel profile={profile} copilot={copilot} onProfileSaved={onProfileSaved} onSaveLifeMap={onSaveLifeMap} onDraft={setDraftMap} />
              <TranscriptEditor text={text} onSave={onSaveTranscript} />
              {turns.length > 0 && <JunoTranscript turns={turns} />}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* The one action: it changes with where the advisor is. A spoken correction confirms itself just above it, with an Undo. */}
      <div className="rv__dock">
        <AnimatePresence>
          {toast && (
            <motion.div key="toast" className="rv__toast" role="status" initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={spring}>
              <span>{toast.text}</span>
              {toast.undo && <button className="rv__link" onClick={toast.undo}>Undo</button>}
              <button className="rv__toast-x" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="rv__bar" role="region" aria-label="Next step">
          <div className="rv__bar-text">
            <b>{queue.length > 0 ? `${queue.length} to check` : 'Ready to approve'}</b>
            <small>Only you can start the analysis. Juno can’t.</small>
          </div>
          <div className="rv__bar-actions">
            <AnimatePresence mode="wait" initial={false}>
              {queue.length > 0 ? (
                <motion.div key="review" className="rv__bar-set" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}>
                  <button className="rv__link" disabled={advancing} onClick={approve}>{advancing ? 'Preparing…' : 'Approve anyway'}</button>
                  <button className="cta-btn" onClick={reviewNow}>Review {queue.length}</button>
                </motion.div>
              ) : (
                <motion.div key="approve" className="rv__bar-set" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}>
                  <button className="cta-btn rv__approve" disabled={advancing} onClick={approve}>{advancing ? 'Preparing…' : 'Approve & prepare the pack'}</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

/** What the advisor said, with names, numbers and risky promises marked where they were spoken. Quiet by default: a few lines. */
function MarkedText({ text, entities, flags, resolved, clamp }: { text: string; entities: Entity[]; flags: string[]; resolved: Set<string>; clamp: boolean }) {
  const marks = useMemo(() => findMarks(text, entities, flags), [text, entities, flags])
  const parts: ReactNode[] = []
  let at = 0
  marks.forEach((m, i) => {
    if (m.start > at) parts.push(text.slice(at, m.start))
    const body = text.slice(m.start, m.end)
    if (m.kind === 'flag') {
      parts.push(<mark key={i} id={`rv-mark-flag-${m.ref}`} className="rv__mark rv__mark--flag">{body}</mark>)
    } else {
      const id = m.ref === 'customerName' ? 'name' : m.ref === 'budgetNotes' ? 'budget' : null
      const check = entities.find((e) => e.key === m.ref)?.check
      const state = id && check && !resolved.has(id) ? 'check' : 'ok'
      parts.push(<mark key={i} className={`rv__mark rv__mark--${state}`}>{body}</mark>)
    }
    at = m.end
  })
  if (at < text.length) parts.push(text.slice(at))
  return <div className={`rv__text${clamp ? ' is-clamped' : ''}`}>{text ? parts : <span className="rv__muted">Nothing was transcribed.</span>}</div>
}

/** Fixing a mis-heard word: edit the transcript and save, and the profile, ledger and follow-up update. */
function TranscriptEditor({ text, onSave }: { text: string; onSave: (t: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    <div className="rv__card">
      <div className="rv__card-head">
        <h3>Transcript</h3>
        {!editing && text && <button className="rv__link" onClick={() => { setDraft(text); setEditing(true) }}>Edit</button>}
      </div>
      {editing ? (
        <>
          <textarea className="rv__textarea" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={saving} autoFocus spellCheck aria-label="Transcript" />
          <p className="rv__hint">Fix any mis-heard words. Saving re-analyses the conversation.</p>
          {error && <p className="rv__error" role="alert">{error}</p>}
          <div className="rv__q-actions">
            <button className="cta-btn" onClick={save} disabled={saving || !draft.trim()}>{saving ? 'Updating…' : 'Save and update'}</button>
            <button className="ghost-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="rv__text">{text || <span className="rv__muted">Nothing was transcribed.</span>}</div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { generateAdvicePack, getAdvicePack, getAskHistory, regenerateAdviceSection, reviewAdvicePack, saveAdvicePack, type AskTurn } from '../../api/client'
import type { AdviceTask, AdvicePack, AdvicePackSection, AdvicePackView, FactFindField, FactSource } from '../../types'
import { printAdvicePack } from '../../utils/advicePackPdf'
import { AGENT_NAME } from '../../brand'
import { countWords } from '../../utils/wordCount'
import { relevanceLabel } from '../../utils/relevance'
import { chipLabel, chipLabels } from '../../utils/askSources'

type Part = 'factFind' | 'record' | 'followUp' | 'crm' | 'meeting' | 'discussion'
type Tone = 'warm' | 'professional' | 'brief'

const SOURCE_LABEL: Record<FactSource, string> = {
  customer: 'Customer said',
  profile: 'From conversation',
  advisor: 'Added by you',
  missing: 'Not mentioned',
}
const TONES: { id: Tone; label: string }[] = [
  { id: 'warm', label: 'Warm' },
  { id: 'professional', label: 'Professional' },
  { id: 'brief', label: 'Brief' },
]

interface Props {
  runId: string
  customerName?: string | null
  /** The run's agents have finished — until then there is nothing to build a pack from. */
  ready: boolean
}

/**
 * The advisor's after-the-meeting pack, built automatically when the suggestion lands: a pre-filled fact-find,
 * the record of advice, the customer follow-up, the CRM note and tasks, and a brief for the next meeting. Everything
 * is an editable draft, every fact shows where it came from, and the advisor signs it off when satisfied.
 */
export function AdvicePackPanel({ runId, customerName, ready }: Props) {
  const [view, setView] = useState<AdvicePackView | null>(null)
  const [discussion, setDiscussion] = useState<AskTurn[]>([])
  const [pack, setPack] = useState<AdvicePack | null>(null)
  const [dirty, setDirty] = useState(false)
  const [part, setPart] = useState<Part>('factFind')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const nonePolls = useRef(0)
  dirtyRef.current = dirty

  // Load, then keep polling while the pack is still being built after the run (or hasn't started yet).
  useEffect(() => {
    if (!ready) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    nonePolls.current = 0
    async function tick() {
      try {
        const v = await getAdvicePack(runId)
        if (!alive) return
        setView(v)
        if (v.pack && !dirtyRef.current) setPack(v.pack)
        const again = v.status === 'GENERATING' || (v.status === 'NONE' && nonePolls.current++ < 3)
        if (again) timer = setTimeout(tick, 3000)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the advice pack')
      }
    }
    tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [runId, ready])

  // The advisor's discussion with Juno about the suggestions belongs in the pack; it is read fresh each time.
  useEffect(() => {
    if (!ready) return
    let alive = true
    void getAskHistory(runId).then((t) => alive && setDiscussion(t))
    return () => {
      alive = false
    }
  }, [runId, ready])

  const edit = useCallback((fn: (p: AdvicePack) => AdvicePack) => {
    setPack((p) => (p ? fn(p) : p))
    setDirty(true)
  }, [])

  async function act<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    setBusy(label)
    setError(null)
    try {
      return await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      return undefined
    } finally {
      setBusy(null)
    }
  }

  /** Saves pending edits first, so a regenerate or sign-off never discards them. */
  async function flush(): Promise<AdvicePack | null> {
    if (!pack) return null
    if (!dirty) return pack
    const saved = await saveAdvicePack(runId, pack)
    setPack(saved)
    setDirty(false)
    return saved
  }

  const save = () => act('save', flush)
  const regenerateAll = () =>
    act('all', async () => {
      const next = await generateAdvicePack(runId, pack?.tone ?? 'warm')
      setPack(next)
      setDirty(false)
      setView({ status: 'READY', pack: next })
    })
  const regenerate = (section: AdvicePackSection, tone?: Tone) =>
    act(section, async () => {
      await flush()
      const next = await regenerateAdviceSection(runId, section, tone)
      setPack(next)
      setDirty(false)
    })
  const signOff = () =>
    act('review', async () => {
      await flush()
      const next = await reviewAdvicePack(runId)
      setPack(next)
    })

  function copy(text: string, key: string) {
    const done = () => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800)
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done)
    else done()
  }

  if (!ready) {
    return (
      <div className="glass-card ws__waiting">
        <span className="proposal__spinner" />
        <div>
          <strong>The advice pack is built from the finished suggestion</strong>
          <p>It starts automatically as soon as {AGENT_NAME} completes.</p>
        </div>
      </div>
    )
  }

  if (!pack) {
    const generating = view?.status === 'GENERATING' || busy === 'all' || (view?.status === 'NONE' && nonePolls.current <= 3 && !error)
    return (
      <div className="glass-card ap-empty">
        {generating || !view ? (
          <>
            <span className="proposal__spinner" />
            <div>
              <strong>Preparing the advice pack…</strong>
              <p>Filling in the fact-find, the record of advice, the follow-up message, the CRM note and the next-meeting brief.</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <strong>No advice pack yet</strong>
              <p>Build the fact-find, record of advice, follow-up, CRM note and next-meeting brief from this suggestion.</p>
            </div>
            <button className="cta-btn" onClick={regenerateAll}>Generate advice pack</button>
          </>
        )}
        {error && <p className="ap-error">{error}</p>}
      </div>
    )
  }

  const ff = pack.factFind
  const captured = ff ? ff.flatMap((s) => s.fields).filter((f) => f.source !== 'missing').length : 0
  const total = ff ? ff.flatMap((s) => s.fields).length : 0
  const failed = (k: AdvicePackSection) => pack.failedSections?.includes(k) || false
  const regenerating = busy === 'all'

  return (
    <div className="ap">
      <header className="glass-card ap-head">
        <div className="ap-head__title">
          <h3>Advice pack</h3>
          <p>
            Drafted from the conversation and the suggestion — check, edit and sign off. Generated{' '}
            {new Date(pack.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {pack.version > 1 ? ` · version ${pack.version}` : ''}
          </p>
        </div>
        <div className="ap-head__actions">
          {pack.review ? (
            <span className="ap-stamp is-ok" title={new Date(pack.review.reviewedAt).toLocaleString()}>
              ✓ Reviewed by {pack.review.reviewedBy.split('@')[0]}
            </span>
          ) : (
            <span className="ap-stamp">Draft · needs your review</span>
          )}
          <button className="ghost-btn" onClick={() => printAdvicePack(pack, customerName, discussion)}>Download PDF</button>
          <button className="ghost-btn" onClick={regenerateAll} disabled={!!busy}>{regenerating ? 'Regenerating…' : 'Regenerate all'}</button>
          {dirty && <button className="ghost-btn ap-save" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>}
          {!pack.review && (
            <button className="cta-btn ap-signoff" onClick={signOff} disabled={!!busy}>{busy === 'review' ? 'Signing off…' : 'Mark as reviewed'}</button>
          )}
        </div>
      </header>

      {error && <p className="ap-error">{error}</p>}

      <nav className="ap-nav" role="tablist" aria-label="Advice pack sections">
        <NavButton active={part === 'factFind'} onClick={() => setPart('factFind')} n={1} title="Fact-find" meta={ff ? `${captured}/${total} captured` : 'Unavailable'} warn={!ff || captured < total} />
        <NavButton active={part === 'record'} onClick={() => setPart('record')} n={2} title="Record of advice" meta={pack.recordOfAdvice ? `${pack.recordOfAdvice.items.length} product${pack.recordOfAdvice.items.length === 1 ? '' : 's'}` : 'Unavailable'} />
        <NavButton active={part === 'followUp'} onClick={() => setPart('followUp')} n={3} title="Follow-up" meta="WhatsApp · email" />
        <NavButton active={part === 'crm'} onClick={() => setPart('crm')} n={4} title="CRM note & tasks" meta={pack.crm ? `${pack.crm.tasks.length} tasks` : 'Unavailable'} />
        <NavButton active={part === 'discussion'} onClick={() => setPart('discussion')} n={6} title="Discussion with Juno" meta={discussion.length ? `${discussion.length} question${discussion.length === 1 ? '' : 's'}` : 'None yet'} />
        <NavButton active={part === 'meeting'} onClick={() => setPart('meeting')} n={5} title="Next meeting" meta={pack.nextMeeting ? `${pack.nextMeeting.questionsToAsk.length} questions` : 'Unavailable'} />
      </nav>

      <div className="ap-body">
        {part === 'factFind' && (
          <Section title="Fact-find" hint="Every value shows where it came from. Gaps are left blank for you to ask — nothing is guessed."
            failed={failed('factFind') || !ff} busy={busy === 'factFind'} onRegenerate={() => regenerate('factFind')}>
            {ff && (
              <>
                <div className="ap-progress">
                  <div><b>{captured}</b> of {total} captured<span>{total - captured > 0 ? ` · ${total - captured} to ask next meeting` : ' · complete'}</span></div>
                  <div className="ap-progress__bar"><span style={{ width: `${(100 * captured) / Math.max(1, total)}%` }} /></div>
                </div>
                <div className="ap-ff">
                  {ff.map((s, si) => (
                    <div className="glass-card ap-ff__card" key={s.title}>
                      <div className="glass-card__label">{s.title}</div>
                      {s.fields.map((f, fi) => (
                        <FieldRow key={f.key} f={f} onChange={(v) => edit((p) => setField(p, si, fi, v))} />
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        )}

        {part === 'record' && (
          <Section title="Record of advice" hint="Why each product was suggested. Scores, reasons and evidence come from the analysis and the product documents."
            failed={failed('recordOfAdvice') || !pack.recordOfAdvice} busy={busy === 'recordOfAdvice'} onRegenerate={() => regenerate('recordOfAdvice')}>
            {pack.recordOfAdvice && (
              <>
                <div className="glass-card ap-card">
                  <div className="glass-card__label">Customer situation and needs</div>
                  <AutoText className="ap-text" rows={3} value={pack.recordOfAdvice.needsSummary}
                    onChange={(e) => edit((p) => ({ ...p, recordOfAdvice: { ...p.recordOfAdvice!, needsSummary: e.target.value } }))} />
                </div>
                {pack.recordOfAdvice.items.map((it, i) => (
                  <div className="glass-card ap-card ap-product" key={it.productName}>
                    <div className="ap-product__head">
                      <span className="ap-product__n">{i + 1}</span>
                      <h4>{it.productName}</h4>
                      <span className="ap-fit">{relevanceLabel(it.fitScore)}</span>
                    </div>
                    <div className="ap-product__grid">
                      <div>
                        <Label>Customer need</Label>
                        <p>{it.need || '—'}</p>
                        <Label>Why we suggest it</Label>
                        <AutoText className="ap-text" rows={4} value={it.rationale}
                          onChange={(e) => edit((p) => setItem(p, i, { rationale: e.target.value }))} />
                        {it.customerQuotes.length > 0 && (
                          <>
                            <Label>In the customer’s words</Label>
                            {it.customerQuotes.map((q) => <blockquote className="ap-quote" key={q}>“{q}”</blockquote>)}
                          </>
                        )}
                      </div>
                      <div>
                        <Label>Existing cover</Label>
                        <p>{it.existingCoverNote || '—'}</p>
                        {it.risksToDisclose.length > 0 && (
                          <>
                            <Label>Risks and points to disclose</Label>
                            <ul className="ap-list">{it.risksToDisclose.map((r) => <li key={r}>{r}</li>)}</ul>
                          </>
                        )}
                        {it.evidence.length > 0 && (
                          <>
                            <Label>Product document evidence</Label>
                            <ul className="ap-evidence">
                              {it.evidence.map((e, k) => (
                                <li key={k}>{e.excerpt}<small>{e.source}</small></li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="ap-two">
                  <div className="glass-card ap-card">
                    <div className="glass-card__label">Compliance checks <span className={`ap-pill ${pack.recordOfAdvice.compliant ? 'is-ok' : 'is-warn'}`}>{pack.recordOfAdvice.compliant ? 'Cleared' : 'Issues raised'}</span></div>
                    {pack.recordOfAdvice.checks.length === 0 ? <p className="panel-empty">No compliance checks were recorded for this run.</p> : (
                      <ul className="ap-checks">
                        {pack.recordOfAdvice.checks.map((c) => (
                          <li key={c.check} className={c.passed ? 'is-pass' : 'is-fail'}><i>{c.passed ? '✓' : '!'}</i><span><b>{c.check}</b><small>{c.note}</small></span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="glass-card ap-card">
                    <div className="glass-card__label">Conduct flags during the conversation</div>
                    {pack.recordOfAdvice.conductFlags.length === 0 ? <p className="ap-clear"><i>✓</i> No risky statements were detected</p> : (
                      <ul className="ap-flags">
                        {pack.recordOfAdvice.conductFlags.map((f, i) => (
                          <li key={i} className={`is-${f.severity}`}><b>{f.severity === 'high' ? 'High risk' : 'Caution'}</b> “{f.statement}”<small>{f.advice}</small></li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="ap-disclosures">
                  {pack.recordOfAdvice.disclosures.map((d) => <p key={d}>{d}</p>)}
                </div>
              </>
            )}
          </Section>
        )}

        {part === 'discussion' && (
          <section className="ap-section">
            <div className="ap-section__head">
              <div>
                <h4>Discussion with Juno</h4>
                <p>Your questions about the suggestions and Juno’s answers, each with the sources it rested on. Juno suggests; you decide. Included in the PDF.</p>
              </div>
            </div>
            {discussion.length === 0 ? (
              <p className="panel-empty">You haven’t talked the suggestions through with Juno yet. Open <b>Live vs final</b> and ask it why it suggested what it did — the discussion is saved here.</p>
            ) : (
              <ol className="ap-disc">
                {discussion.map((t) => {
                  const srcs = Object.values(t.sources ?? {})
                  const labels = chipLabels(srcs)
                  return (
                    <li key={t.turn} className="glass-card ap-disc__turn">
                      <div className="ap-disc__q"><span>You asked</span><p>{t.question}</p></div>
                      <div className="ap-disc__a"><span>Juno answered</span><p>{t.answer}</p></div>
                      {srcs.length > 0 && (
                        <div className="ap-disc__src">
                          {srcs.map((s) => <em key={s.id} className={`is-${s.kind}${s.inferred ? ' is-inferred' : ''}`} title={s.text}>{labels.get(s.id) ?? chipLabel(s)}</em>)}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        )}

        {part === 'followUp' && (
          <Section title="Customer follow-up" hint="A draft in the customer’s own terms — nothing is sent automatically. Pick a tone to rewrite it."
            failed={failed('followUp') || !pack.followUp} busy={busy === 'followUp'} onRegenerate={() => regenerate('followUp')}
            extra={
              <div className="ws__seg ap-tones" role="tablist" aria-label="Tone">
                {TONES.map((t) => (
                  <button key={t.id} role="tab" aria-selected={pack.tone === t.id} className={pack.tone === t.id ? 'is-active' : ''}
                    disabled={!!busy} onClick={() => regenerate('followUp', t.id)}>{t.label}</button>
                ))}
              </div>
            }>
            {pack.followUp && (
              <div className="ap-two">
                <div className="glass-card ap-card">
                  <div className="glass-card__label">WhatsApp
                    <CopyButton done={copied === 'wa'} onClick={() => copy(pack.followUp!.whatsapp, 'wa')} />
                  </div>
                  <div className="ap-wa">
                    <AutoText className="ap-wa__bubble" rows={9} value={pack.followUp.whatsapp}
                      onChange={(e) => edit((p) => ({ ...p, followUp: { ...p.followUp!, whatsapp: e.target.value } }))} />
                    <small>{countWords(pack.followUp.whatsapp)} words</small>
                  </div>
                </div>
                <div className="glass-card ap-card">
                  <div className="glass-card__label">Email
                    <CopyButton done={copied === 'mail'} onClick={() => copy(`Subject: ${pack.followUp!.emailSubject}\n\n${pack.followUp!.emailBody}`, 'mail')} />
                  </div>
                  <input className="ap-input ap-subject" value={pack.followUp.emailSubject} aria-label="Email subject"
                    onChange={(e) => edit((p) => ({ ...p, followUp: { ...p.followUp!, emailSubject: e.target.value } }))} />
                  <AutoText className="ap-text" rows={10} value={pack.followUp.emailBody} aria-label="Email body"
                    onChange={(e) => edit((p) => ({ ...p, followUp: { ...p.followUp!, emailBody: e.target.value } }))} />
                </div>
              </div>
            )}
          </Section>
        )}

        {part === 'crm' && (
          <Section title="CRM note & tasks" hint="Ready to paste into your CRM. Tick tasks off, change dates, or add your own."
            failed={failed('crm') || !pack.crm} busy={busy === 'crm'} onRegenerate={() => regenerate('crm')}>
            {pack.crm && (
              <div className="ap-two ap-two--crm">
                <div className="glass-card ap-card">
                  <div className="glass-card__label">Case note
                    <CopyButton done={copied === 'note'} onClick={() => copy(pack.crm!.caseNote, 'note')} />
                  </div>
                  <AutoText className="ap-text ap-note" rows={14} value={pack.crm.caseNote}
                    onChange={(e) => edit((p) => ({ ...p, crm: { ...p.crm!, caseNote: e.target.value } }))} />
                </div>
                <div className="glass-card ap-card">
                  <div className="glass-card__label">Follow-up tasks
                    <CopyButton done={copied === 'tasks'} onClick={() => copy(pack.crm!.tasks.map((t) => `[${t.done ? 'x' : ' '}] ${t.title} — due ${t.dueDate} (${t.priority})`).join('\n'), 'tasks')} />
                  </div>
                  <ul className="ap-tasks">
                    {pack.crm.tasks.map((t, i) => (
                      <li key={i} className={t.done ? 'is-done' : ''}>
                        <input type="checkbox" checked={t.done} aria-label="Done" onChange={(e) => edit((p) => setTask(p, i, { done: e.target.checked }))} />
                        <div className="ap-tasks__main">
                          <input className="ap-input" value={t.title} aria-label="Task" onChange={(e) => edit((p) => setTask(p, i, { title: e.target.value }))} />
                          <div className="ap-tasks__meta">
                            <input className="ap-input ap-date" type="date" value={t.dueDate} aria-label="Due date" onChange={(e) => edit((p) => setTask(p, i, { dueDate: e.target.value }))} />
                            <select className={`ap-prio is-${t.priority}`} value={t.priority} aria-label="Priority" onChange={(e) => edit((p) => setTask(p, i, { priority: e.target.value as AdviceTask['priority'] }))}>
                              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                            </select>
                            <small>{t.reason}</small>
                          </div>
                        </div>
                        <button className="ap-x" aria-label="Remove task" onClick={() => edit((p) => ({ ...p, crm: { ...p.crm!, tasks: p.crm!.tasks.filter((_, j) => j !== i) } }))}>×</button>
                      </li>
                    ))}
                  </ul>
                  <button className="ghost-btn ap-add" onClick={() => edit((p) => ({ ...p, crm: { ...p.crm!, tasks: [...p.crm!.tasks, { title: '', reason: 'Added by you', priority: 'medium', dueInDays: 7, dueDate: inDays(7), done: false }] } }))}>+ Add task</button>
                </div>
              </div>
            )}
          </Section>
        )}

        {part === 'meeting' && (
          <Section title="Next-meeting brief" hint="What to achieve, what to ask first, and how to handle the likely pushback."
            failed={failed('nextMeeting') || !pack.nextMeeting} busy={busy === 'nextMeeting'} onRegenerate={() => regenerate('nextMeeting')}>
            {pack.nextMeeting && (
              <>
                <div className="glass-card ap-card ap-objective">
                  <div className="glass-card__label">Objective</div>
                  <p>{pack.nextMeeting.objective}</p>
                </div>
                <div className="ap-two">
                  <div className="glass-card ap-card">
                    <div className="glass-card__label">Questions to ask, in order</div>
                    <ol className="ap-questions">{pack.nextMeeting.questionsToAsk.map((q) => <li key={q}>{q}</li>)}</ol>
                  </div>
                  <div className="glass-card ap-card">
                    <div className="glass-card__label">Information still missing</div>
                    {pack.nextMeeting.gapsToFill.length === 0 ? <p className="ap-clear"><i>✓</i> The fact-find is complete</p> : (
                      <div className="ap-chips">{pack.nextMeeting.gapsToFill.map((g) => <span key={g}>{g}</span>)}</div>
                    )}
                    <div className="glass-card__label ap-gap-top">Talking points</div>
                    <ul className="ap-list">{pack.nextMeeting.talkingPoints.map((t) => <li key={t}>{t}</li>)}</ul>
                  </div>
                </div>
                <div className="glass-card ap-card">
                  <div className="glass-card__label">Likely objections and how to respond</div>
                  <div className="ap-objections">
                    {pack.nextMeeting.likelyObjections.map((o) => (
                      <div key={o.objection}><b>“{o.objection}”</b><p>{o.response}</p></div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────

function NavButton(props: { active: boolean; onClick: () => void; n: number; title: string; meta: string; warn?: boolean }) {
  return (
    <button role="tab" aria-selected={props.active} className={`ap-nav__btn${props.active ? ' is-active' : ''}`} onClick={props.onClick}>
      <span className="ap-nav__n">{props.n}</span>
      <span className="ap-nav__text"><strong>{props.title}</strong><small className={props.warn ? 'is-warn' : ''}>{props.meta}</small></span>
    </button>
  )
}

function Section(props: {
  title: string
  hint: string
  failed: boolean
  busy: boolean
  onRegenerate: () => void
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="ap-section">
      <div className="ap-section__head">
        <div>
          <h4>{props.title}</h4>
          <p>{props.hint}</p>
        </div>
        <div className="ap-section__tools">
          {props.extra}
          <button className="ghost-btn" onClick={props.onRegenerate} disabled={props.busy}>{props.busy ? 'Regenerating…' : 'Regenerate'}</button>
        </div>
      </div>
      {props.failed && !props.children ? (
        <div className="glass-card ap-empty"><div><strong>This section could not be generated</strong><p>Try regenerating it — the rest of the pack is unaffected.</p></div></div>
      ) : (
        props.children
      )}
    </section>
  )
}

function FieldRow({ f, onChange }: { f: FactFindField; onChange: (v: string) => void }) {
  return (
    <label className={`ap-field is-${f.source}`}>
      <span className="ap-field__top">
        <span className="ap-field__label">{f.label}</span>
        <span className={`ap-src ap-src--${f.source}`}>{SOURCE_LABEL[f.source]}</span>
      </span>
      <input className="ap-input" value={f.value} onChange={(e) => onChange(e.target.value)}
        placeholder={f.source === 'missing' ? 'Not mentioned — ask at the next meeting' : ''} />
      {f.quote && f.source !== 'missing' && <q className="ap-field__quote">{f.quote}</q>}
    </label>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="ap-label">{children}</div>

function CopyButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return <button className={`ap-copy${done ? ' is-done' : ''}`} onClick={onClick}>{done ? '✓ Copied' : 'Copy'}</button>
}

// ── Immutable edits ──────────────────────────────────────────────────────

function setField(p: AdvicePack, si: number, fi: number, value: string): AdvicePack {
  return {
    ...p,
    factFind: p.factFind!.map((s, i) =>
      i !== si ? s : {
        ...s,
        fields: s.fields.map((f, j) =>
          j !== fi ? f : { ...f, value, source: value.trim() === '' ? 'missing' : 'advisor', quote: value.trim() === '' ? null : f.quote },
        ),
      },
    ),
  }
}

function setItem(p: AdvicePack, i: number, patch: Partial<NonNullable<AdvicePack['recordOfAdvice']>['items'][number]>): AdvicePack {
  const r = p.recordOfAdvice!
  return { ...p, recordOfAdvice: { ...r, items: r.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } }
}

function setTask(p: AdvicePack, i: number, patch: Partial<AdviceTask>): AdvicePack {
  return { ...p, crm: { ...p.crm!, tasks: p.crm!.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) } }
}

function inDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A textarea that grows to fit what is in it, so nothing is ever hidden behind a scrollbar. */
function AutoText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [props.value])
  return <textarea ref={ref} {...props} />
}

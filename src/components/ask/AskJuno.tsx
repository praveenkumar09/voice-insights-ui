import { useEffect, useMemo, useRef, useState } from 'react'
import type { AskSource } from '../../api/client'
import { useAskJuno, type AskMessage, type AskPhase } from '../../hooks/useAskJuno'
import { chipLabel, chipLabels } from '../../utils/askSources'
import '../../ask.css'

interface Props {
  runId: string
  customerName?: string | null
}

const STATUS: Record<AskPhase, string> = {
  off: 'Tap to talk to Juno',
  starting: 'Getting ready…',
  ready: 'Tap to ask something',
  listening: 'Listening — ask away',
  hearing: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Juno is speaking',
}

const ORB: Record<AskPhase, string> = {
  off: '',
  starting: ' jn__orb--thinking',
  ready: '',
  listening: ' jn__orb--listening',
  hearing: ' jn__orb--listening',
  thinking: ' jn__orb--thinking',
  speaking: ' jn__orb--speaking',
}

/** A factual-sounding sentence with no source behind it: marked, so it is never mistaken for something the file says. */
function isUnsourced(text: string, sources: AskSource[]): boolean {
  if (sources.length > 0 || text.length < 50 || text.endsWith('?')) return false
  return !/^(that isn[’']t|i can[’']t|i don[’']t|i[’']m (not sure|only here)|sorry|good|fair|right|mm|of course|sure|no,|yes,)/i.test(text)
}

function Icon({ kind }: { kind: AskSource['kind'] }) {
  const common = { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'customer') return <svg {...common}><circle cx="8" cy="5.5" r="2.6" /><path d="M2.8 13.6c.6-2.6 2.6-3.9 5.2-3.9s4.6 1.3 5.2 3.9" /></svg>
  if (kind === 'document') return <svg {...common}><path d="M4 1.8h5.4L12.6 5v9.2H4z" /><path d="M9.2 1.8V5.2h3.4M6 8.4h4.6M6 10.8h4.6" /></svg>
  if (kind === 'compliance') return <svg {...common}><path d="M8 1.6l5.2 2v4.2c0 3-2.2 5.4-5.2 6.6-3-1.2-5.2-3.6-5.2-6.6V3.6z" /><path d="M5.6 8l1.7 1.7L10.6 6.4" /></svg>
  return <svg {...common}><path d="M2.5 13.5V8M7 13.5V3M11.5 13.5V6" /></svg>
}

/**
 * "Talk it through with Juno": the advisor questions the suggestions out loud and Juno answers like a colleague who was in the
 * room, from this customer's file and the product documents, with the source of each statement one tap away.
 */
export function AskJuno({ runId, customerName }: Props) {
  const k = useAskJuno(runId)
  const [active, setActive] = useState<{ message: string; source: string } | null>(null)
  const [typed, setTyped] = useState('')
  const [showEarlier, setShowEarlier] = useState(false)
  const [allChips, setAllChips] = useState<Set<string>>(new Set())
  const threadRef = useRef<HTMLDivElement>(null)

  // Keep the newest words in view as Juno speaks.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [k.messages, k.phase])

  const level = Math.min(1, k.amplitude * 3)
  const name = customerName?.trim() || 'the customer'
  const live = k.phase !== 'off'
  const busy = k.phase === 'thinking' || k.phase === 'speaking'
  const hasThread = k.messages.length > 0

  const primary = useMemo(() => {
    switch (k.phase) {
      case 'off': return 'Start talking'
      case 'starting': return 'Getting ready…'
      case 'ready': return 'Ask something'
      case 'listening': return 'Pause listening'
      case 'hearing': return 'I’m done'
      case 'thinking': return 'Stop'
      case 'speaking': return 'Interrupt'
    }
  }, [k.phase])

  function submitTyped(e: React.FormEvent) {
    e.preventDefault()
    const q = typed.trim()
    if (!q || busy) return
    setTyped('')
    void k.ask(q)
  }

  const pick = (m: AskMessage, s: AskSource) => setActive((a) => (a && a.message === m.id && a.source === s.id ? null : { message: m.id, source: s.id }))

  function renderMessage(m: AskMessage) {
    if (m.role === 'advisor') {
      return (
        <div key={m.id} className="ask__msg ask__msg--you">
          <span className="ask__who">You</span>
          <p>{m.text}</p>
        </div>
      )
    }
    const shown = m.sentences.filter((s) => s.shown)
    const sources: AskSource[] = []
    for (const s of shown) for (const src of s.sources) if (!sources.some((x) => x.id === src.id)) sources.push(src)
    const open = active && active.message === m.id ? sources.find((s) => s.id === active.source) : undefined
    const labels = chipLabels(sources)
    return (
      <div key={m.id} className={`ask__msg ask__msg--juno${m.error ? ' is-error' : ''}`}>
        <span className="ask__who"><i aria-hidden /> Juno</span>
        {shown.length === 0 && !m.error && !m.done && <span className="ask__typing" aria-label="Juno is thinking"><i /><i /><i /></span>}
        {shown.length > 0 && (
          <p aria-live="polite">
            {shown.map((s) => (
              <span key={s.key} className={`ask__sentence${open && s.sources.some((x) => x.id === open.id) ? ' is-cited' : ''}${isUnsourced(s.text, s.sources) ? ' is-unsourced' : ''}`} title={isUnsourced(s.text, s.sources) ? 'Juno could not point to a source in the file for this' : undefined}>{s.text} </span>
            ))}
            {m.interrupted && <em className="ask__cut"> — you cut in</em>}
          </p>
        )}
        {m.error && <p className="ask__error">{m.error}</p>}
        {m.interrupted && shown.length === 0 && <p><em className="ask__cut">You cut in before I got going.</em></p>}
        {sources.length > 0 && (
          <div className="ask__sources" role="group" aria-label="Where this comes from">
            {(allChips.has(m.id) ? sources : sources.slice(0, 6)).map((s) => (
              <button key={s.id} className={`ask__chip ask__chip--${s.kind}${open?.id === s.id ? ' is-on' : ''}${s.inferred ? ' is-inferred' : ''}`} onClick={() => pick(m, s)} title={s.inferred ? `Closest source in the file: ${s.label}` : s.label} aria-pressed={open?.id === s.id}>
                <Icon kind={s.kind} />{labels.get(s.id) ?? chipLabel(s)}
              </button>
            ))}
            {sources.length > 6 && !allChips.has(m.id) && (
              <button className="ask__chip ask__chip--more" onClick={() => setAllChips((a) => new Set(a).add(m.id))}>+{sources.length - 6} more</button>
            )}
          </div>
        )}
        {open && (
          <blockquote className="ask__source">
            <b>{open.label}{open.inferred ? ' · closest source' : ''}</b>
            <span>{open.text}</span>
            {open.file && <em>{open.file}</em>}
          </blockquote>
        )}
      </div>
    )
  }

  return (
    <section className={`jn ask${live ? ' is-live' : ''}${k.phase === 'listening' || k.phase === 'hearing' ? ' jn--listening' : k.phase === 'thinking' ? ' jn--thinking' : ''}`} aria-label="Talk it through with Juno">
      <div className="jn__mesh" />
      <div className="jn__grid" />

      <header className="jn__bar ask__bar">
        <div className="jn__brand">
          <span className="jn__mark" aria-hidden><i /></span>
          <div>
            <b>Talk it through with Juno</b>
            <small>Ask why it suggested what it did — out loud</small>
          </div>
        </div>
        <span />
        <div className="ask__tools">
          <button className={`jn__pill${k.handsFree ? ' is-on' : ''}`} aria-pressed={k.handsFree} onClick={() => k.setHandsFree(!k.handsFree)} title="Juno starts listening again by itself after each answer">
            Hands-free
          </button>
          <button className={`jn__pill${k.voiceOn ? ' is-on' : ''}`} aria-pressed={k.voiceOn} onClick={() => k.setVoiceOn(!k.voiceOn)} title="Hear Juno's answers">
            {k.voiceOn ? 'Voice on' : 'Voice off'}
          </button>
          {k.voiceOn && (
            <span className="jn__seg" role="group" aria-label="Juno's voice">
              <button className={k.voiceKind === 'female' ? 'is-on' : ''} onClick={() => k.setVoiceKind('female')}>Coral</button>
              <button className={k.voiceKind === 'male' ? 'is-on' : ''} onClick={() => k.setVoiceKind('male')}>Ash</button>
            </span>
          )}
        </div>
      </header>

      <div className="ask__body">
        {/* Presence: the orb, what Juno is doing, what the advisor is saying */}
        <div className="ask__presence">
          <button className="ask__orb-btn" onClick={k.tapOrb} aria-label={`${STATUS[k.phase]}. ${primary}`}>
            <span className={`jn__orb${ORB[k.phase]}`} style={{ ['--lvl' as string]: k.phase === 'listening' || k.phase === 'hearing' ? level : k.phase === 'speaking' ? 0.5 : 0 }}>
              <span className="jn__orb-halo" />
              <span className="jn__orb-ring jn__orb-ring--1" />
              <span className="jn__orb-ring jn__orb-ring--2" />
              <span className="jn__orb-ring jn__orb-ring--3" />
              <span className="jn__orb-core"><span className="jn__orb-swirl" /><span className="jn__orb-gloss" /></span>
            </span>
          </button>
          <div className="ask__status" aria-live="polite">{STATUS[k.phase]}</div>

          <div className="ask__caption" aria-live="polite">
            {(k.phase === 'listening' || k.phase === 'hearing') && k.caption ? <q>{k.caption}</q> : null}
            {(k.phase === 'listening' || k.phase === 'hearing') && !k.caption && <span className="ask__try">Try: “Why did you put {name === 'the customer' ? 'the first one' : 'it'} first?”</span>}
            {k.phase === 'off' && !hasThread && <span className="ask__try">Press the orb and ask like you would a colleague.</span>}
            {k.hint && <span className="ask__hint">{k.hint}</span>}
          </div>

          <div className="ask__actions">
            <button className="ask__primary" onClick={k.tapOrb} disabled={k.phase === 'starting'}>{primary}</button>
            {live && <button className="jn__ghost ask__end" onClick={k.end}>End conversation</button>}
          </div>
          {!k.neuralVoice && k.voiceOn && <p className="ask__note">Juno’s natural voice isn’t available right now; the browser’s voice is used instead.</p>}
        </div>

        {/* The conversation */}
        <div className="ask__side">
          <div className="ask__thread" ref={threadRef} role="log" aria-label="Conversation with Juno">
            {k.earlier.length > 0 && (
              <button className="ask__earlier" onClick={() => setShowEarlier((v) => !v)} aria-expanded={showEarlier}>
                {showEarlier ? 'Hide' : 'Show'} earlier in this discussion ({k.earlier.filter((m) => m.role === 'advisor').length})
              </button>
            )}
            {showEarlier && k.earlier.map(renderMessage)}
            {!hasThread && (
              <div className="ask__msg ask__msg--juno ask__msg--intro">
                <span className="ask__who"><i aria-hidden /> Juno</span>
                <p>I was in the room when the agents worked this out. Ask me why I suggested what I did — I’ll answer from {name}’s file and the product documents, and I’ll tell you plainly when something isn’t there.</p>
              </div>
            )}
            {k.messages.map(renderMessage)}
          </div>

          {k.starters.length > 0 && (
            <div className="ask__starters" role="group" aria-label="Questions to start with">
              {k.starters.map((s) => (
                <button key={s.label} className="jn__pill" onClick={() => !busy && void k.ask(s.question)} disabled={busy} title={s.question}>{s.label}</button>
              ))}
            </div>
          )}

          <form className="ask__type" onSubmit={submitTyped}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a question…" aria-label="Type a question for Juno" maxLength={500} />
            <button type="submit" disabled={!typed.trim() || busy}>Ask</button>
            {hasThread && <button type="button" className="ask__new" onClick={k.newDiscussion} title="Clear this discussion and start again">New discussion</button>}
          </form>
          <p className="ask__foot">Juno suggests; you decide. Answers come from this customer’s file and the product documents, and this discussion is saved with the suggestion.</p>
        </div>
      </div>
    </section>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import { JUNO_TOPICS, LANGUAGES, type useJuno } from '../../hooks/useJuno'
import type { CopilotInsights, CustomerProfile } from '../../types'
import { JunoCanvas, type FieldMode } from './JunoCanvas'

type Juno = ReturnType<typeof useJuno>

interface Props {
  k: Juno
  /** 0..1 loudness of the customer's voice. */
  amplitude: number
  /** What the customer is saying right now (not yet a finished sentence). */
  partialText: string
  profile: CustomerProfile | null
  copilot: CopilotInsights | null
  /** The conversation has been analysed and is ready to hand to the advisor. */
  canRecommend: boolean
  advancing: boolean
  /** Called only for a real click by the advisor — see the hand-off button. */
  onRecommend: () => void
  onBrief: () => void
  /** The browser has no speech synthesis, so Juno can only caption. */
  noVoice: boolean
  /** Customer-safe view: internal signals (mood, interest) are not shown. */
  safe?: boolean
}

const STEPS = ['Hello', 'Consent', 'Getting to know you', 'Hand-off'] as const

function stepIndex(stage: Juno['stage']): number {
  if (stage === 'idle' || stage === 'connecting') return -1
  if (stage === 'consent') return 1
  if (stage === 'discovery') return 2
  if (stage === 'wrapup' || stage === 'finished') return 3
  return 1
}

/** What Juno has actually picked up for each topic, straight from the live analysis. */
function topicFacts(key: string, p: CustomerProfile | null, c: CopilotInsights | null): string[] {
  const map = c?.lifeMap
  switch (key) {
    case 'about':
      return [p?.customerName, p?.age ? `${p.age} years old` : null, p?.occupation].filter(Boolean) as string[]
    case 'family': {
      const people = (map?.people ?? []).map((x) => (x.name ? `${x.name} · ${x.relation}` : x.relation))
      return people.length ? people : p?.dependents != null ? [`${p.dependents} dependant${p.dependents === 1 ? '' : 's'}`] : []
    }
    case 'goals':
      return (map?.dreams ?? []).map((d) => d.label)
    case 'concerns':
      return (map?.worries ?? []).map((w) => w.label)
    case 'money':
      return [p?.incomeBand, p?.budgetNotes].filter(Boolean) as string[]
    case 'cover':
      return (p?.existingPolicies ?? []).filter(Boolean)
    default:
      return []
  }
}

const TOPIC_ICON: Record<string, JSX.Element> = {
  about: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" />,
  family: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zm8 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2.5 19a5.5 5.5 0 0111 0m1-1.5a4.5 4.5 0 017.5 1.5" />,
  goals: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.4 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />,
  concerns: <path d="M12 3l9 16H3zM12 10v4m0 3v.01" />,
  money: <path d="M12 3v18m4-14.5C15 5.5 13.6 5 12 5c-2 0-3.5 1-3.5 2.6S10 10 12 10.5s3.5 1.1 3.5 2.9S14 17 12 17c-1.6 0-3-.5-4-1.5" />,
  cover: <path d="M12 3l8 3v6c0 5-3.4 8.2-8 9.5C7.4 20.2 4 17 4 12V6z" />,
}

/**
 * The Juno stage: Juno hosts the conversation on its own. On the left, its presence — a glowing orb whose
 * colour and motion say who is talking (rose and gold for Juno, teal for the customer, violet while it thinks),
 * with its words captioned as they are spoken. On the right, a live "what Juno has learned" panel that fills in
 * with the customer's own details. When the conversation is over the stage hands over to the real advisor, who
 * alone can start the analysis.
 */
export function JunoStage({ k, amplitude, partialText, profile, copilot, canRecommend, advancing, onRecommend, onBrief, noVoice, safe = false }: Props) {
  const { stage, speaking, thinking, listening, covered, line, revealed, progress } = k
  const mode: FieldMode = stage === 'finished' || stage === 'declined' ? 'done' : speaking ? 'speaking' : thinking ? 'thinking' : listening ? 'listening' : 'idle'
  const step = stepIndex(stage)
  const live = stage !== 'idle' && stage !== 'finished' && stage !== 'declined' && stage !== 'error'
  const orbRef = useRef<HTMLDivElement>(null)
  const nextTopic = JUNO_TOPICS.find((t) => !covered.includes(t.key))?.key

  const words = useMemo(() => {
    let at = 0
    // Chinese has no spaces between words, so its captions light up a character at a time.
    const tokens = k.lang === 'zh' ? Array.from(line) : line.split(/(\s+)/)
    return tokens.map((w) => {
      const start = at
      at += w.length
      return { w, start }
    })
  }, [line, k.lang])

  const stateLabel =
    stage === 'idle' ? 'Ready'
    : stage === 'connecting' ? 'Waking up'
    : stage === 'declined' ? 'Consent declined'
    : stage === 'finished' ? 'Handed over'
    : stage === 'wrapup' ? 'Wrapping up'
    : speaking ? 'Speaking'
    : thinking ? 'Thinking'
    : listening ? 'Listening'
    : 'Ready'

  const facts = useMemo(
    () => Object.fromEntries(JUNO_TOPICS.map((t) => [t.key, topicFacts(t.key, profile, copilot)])),
    [profile, copilot],
  )

  return (
    <section className={`jn jn--${mode}${live ? ' is-live' : ''}`} aria-label="Juno conversation">
      <div className="jn__mesh" />
      <div className="jn__grid" />
      <JunoCanvas mode={mode} level={amplitude} anchor={orbRef} />

      <header className="jn__bar">
        <div className="jn__brand">
          <span className="jn__mark" aria-hidden><i /></span>
          <div>
            <b>Juno</b>
            <small>AIA Singapore digital &amp; recommendation assistant</small>
          </div>
        </div>

        <ol className="jn__steps" aria-label="Conversation progress">
          {STEPS.map((label, i) => (
            <li key={label} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
              <span className="jn__step-node">{i < step ? '✓' : i + 1}</span>
              <em>{label}</em>
            </li>
          ))}
        </ol>

        <div className="jn__tools">
          <div className="jn__seg jn__seg--lang" role="group" aria-label="Language">
            {LANGUAGES.map((l) => (
              <button key={l.id} className={k.lang === l.id ? 'is-on' : ''} aria-pressed={k.lang === l.id} title={l.name} onClick={() => k.setLanguage(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="jn__body">
        {/* Presence */}
        <div className="jn__presence">
          <div className="jn__orb-zone">
            <div ref={orbRef} className={`jn__orb jn__orb--${mode}`} style={{ ['--lvl' as string]: Math.min(1, amplitude * 3) }}>
              <span className="jn__orb-halo" />
              <span className="jn__orb-ring jn__orb-ring--1" />
              <span className="jn__orb-ring jn__orb-ring--2" />
              <span className="jn__orb-ring jn__orb-ring--3" />
              <span className="jn__orb-core">
                <span className="jn__orb-swirl" />
                <span className="jn__orb-gloss" />
              </span>
            </div>
            <div className="jn__state" aria-live="polite">
              <span className="jn__state-dot" />
              {stateLabel}
            </div>
          </div>

          <div className="jn__talk">
            <AnimatePresence mode="wait">
              {stage === 'idle' && (
                <motion.div key="idle" className="jn__idle" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <span className="jn__eyebrow">Hosted by Juno</span>
                  <h3>A first conversation, handled end to end</h3>
                  <p>
                    Juno introduces itself, asks the customer’s permission, and talks through their family, goals, worries and
                    budget — then hands over to you with everything captured and ready to analyse.
                  </p>
                  <button className="jn__start" onClick={k.start}>
                    <span className="jn__start-glow" />
                    <svg viewBox="0 0 24 24" aria-hidden><path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm6-3a6 6 0 01-12 0M12 18v3" /></svg>
                    Start with Juno
                  </button>
                  <ul className="jn__promises">
                    <li>Consent first</li>
                    <li>Knows our products</li>
                    <li>You stay in control</li>
                  </ul>
                  <p className="jn__langs">Speaks English, 中文, Bahasa Melayu and தமிழ் — choose above</p>
                </motion.div>
              )}

              {live && (
                <motion.div key="live" className="jn__live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <span className="jn__speaker">{thinking ? 'Juno is thinking' : 'Juno'}</span>
                  <p className="jn__line" aria-live="polite">
                    {stage === 'connecting' && !line ? <span className="jn__muted">Connecting the microphone…</span> : words.map((x, i) => (
                      <span key={i} className={x.start < revealed || !speaking ? 'is-on' : ''}>{x.w}</span>
                    ))}
                  </p>

                  <div className={`jn__you${partialText || listening || thinking ? ' is-on' : ''}`} style={{ ['--lvl' as string]: Math.min(1, amplitude * 3) }}>
                    {thinking ? (
                      <span className="jn__dots" aria-label="Juno is thinking"><i /><i /><i /></span>
                    ) : partialText ? (
                      <><span className="jn__mic"><i /><i /><i /><i /></span><span>{partialText}</span></>
                    ) : listening ? (
                      <><span className="jn__mic"><i /><i /><i /><i /></span><span className="jn__muted">Listening — just answer naturally</span></>
                    ) : null}
                  </div>

                  {stage === 'consent' && listening && (
                    <div className="jn__consent">
                      <button className="jn__yes" onClick={() => k.answerConsent(true)}>{k.phrases.yes}</button>
                      <button className="jn__no" onClick={() => k.answerConsent(false)}>{k.phrases.no}</button>
                      <small>Answer out loud, or tap.</small>
                    </div>
                  )}

                  <button className="jn__end" onClick={k.end}>End conversation</button>
                </motion.div>
              )}

              {stage === 'declined' && (
                <motion.div key="declined" className="jn__idle" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="jn__badge jn__badge--shield">
                    <svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.4 8.2-8 9.5C7.4 20.2 4 17 4 12V6z" /></svg>
                  </div>
                  <h3>No problem — nothing was kept</h3>
                  <p className="jn__line is-static">{line}</p>
                  <button className="jn__ghost" onClick={k.reset}>Back</button>
                </motion.div>
              )}

              {stage === 'error' && (
                <motion.div key="error" className="jn__idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h3>Juno lost the connection</h3>
                  <p>What was said so far is kept. You can start again.</p>
                  <button className="jn__ghost" onClick={k.reset}>Start over</button>
                </motion.div>
              )}

              {stage === 'finished' && (
                <motion.div key="done" className="jn__idle jn__handoff" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="jn__sparks" aria-hidden>
                    {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--n' as string]: i }} />)}
                  </div>
                  <div className="jn__badge">
                    <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </div>
                  <span className="jn__eyebrow">Conversation complete</span>
                  <h3>Juno hands over to you</h3>
                  <p>
                    {progress} of {JUNO_TOPICS.length} topics covered. What the customer shared is on the right. Names can be misheard, so check and correct them in the review below, then start the analysis yourself.
                  </p>
                  <div className="jn__lock">
                    <svg viewBox="0 0 24 24" aria-hidden><path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" /></svg>
                    Only the advisor can start the analysis. Juno cannot.
                  </div>
                  <div className="jn__actions">
                    {canRecommend ? (
                      <button
                        className="jn__start jn__start--go"
                        disabled={advancing}
                        // A synthetic click (script or automation) is ignored: only a real press by a person counts.
                        onClick={(e) => e.isTrusted && onRecommend()}
                      >
                        <span className="jn__start-glow" />
                        {advancing ? 'Preparing…' : 'Get Recommendations'}
                      </button>
                    ) : (
                      <button className="jn__start jn__start--go" disabled>Saving the conversation…</button>
                    )}
                    <button className="jn__ghost" onClick={onBrief} disabled={!canRecommend}>Download brief (PDF)</button>
                    <button className="jn__ghost" onClick={k.reset}>New conversation</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Preferences live here, not in the header, so the header stays uncluttered */}
          <div className="jn__prefs" aria-label="Juno preferences">
            {k.voiceChoices.length > 1 && (
              <div className="jn__seg" role="group" aria-label="Juno voice">
                {k.voiceChoices.map((c) => (
                  <button key={c.id} className={k.voiceId === c.id ? 'is-on' : ''} aria-pressed={k.voiceId === c.id} onClick={() => k.chooseVoice(c.id)} disabled={speaking}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <button
              className={`jn__pill${k.bargeEnabled ? ' is-on' : ''}`}
              onClick={() => k.setBargeMode(k.bargeEnabled ? 'off' : 'on')}
              aria-pressed={k.bargeEnabled}
              title={k.headset ? 'Headphones detected: the customer can interrupt Juno.' : 'Let the customer interrupt Juno. Works best with headphones; on speakers Juno can hear itself.'}
            >
              {k.bargeEnabled ? 'Interrupt: on' : 'Interrupt: off'}
            </button>
            <button className={`jn__pill${k.silent || noVoice ? ' is-muted' : ''}`} onClick={k.toggleSilent} aria-pressed={k.silent} title={k.silent ? 'Juno is silent — captions only' : 'Mute Juno (captions stay)'}>
              {k.silent || noVoice ? 'Captions only' : 'Voice on'}
            </button>
          </div>
        </div>

        {/* Live understanding */}
        <aside className="jn__insight" aria-label="What Juno has learned">
          <div className="jn__insight-head">
            <div>
              <span className="jn__eyebrow">Live understanding</span>
              <h4>What Juno has learned</h4>
            </div>
            <div className="jn__ring" aria-label={`${progress} of ${JUNO_TOPICS.length} topics`}>
              <svg viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" className="jn__ring-track" />
                <motion.circle cx="22" cy="22" r="18" className="jn__ring-fill" strokeDasharray={113.1} initial={{ strokeDashoffset: 113.1 }} animate={{ strokeDashoffset: 113.1 * (1 - progress / JUNO_TOPICS.length) }} transition={{ duration: 0.8, ease: 'easeOut' }} />
              </svg>
              <b>{progress}<small>/{JUNO_TOPICS.length}</small></b>
            </div>
          </div>

          <ol className="jn__learn">
            {JUNO_TOPICS.map((t) => {
              const done = covered.includes(t.key)
              const items = facts[t.key]
              const active = live && !done && t.key === nextTopic
              return (
                <li key={t.key} className={`${done ? 'is-done' : ''}${active ? ' is-active' : ''}`}>
                  <span className="jn__learn-ic">
                    {done ? (
                      <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24">{TOPIC_ICON[t.key]}</svg>
                    )}
                  </span>
                  <div className="jn__learn-body">
                    <div className="jn__learn-title">
                      {t.label}
                      {active && <em>listening for this</em>}
                    </div>
                    <div className="jn__chips">
                      <AnimatePresence initial={false}>
                        {items.map((it) => (
                          <motion.span key={it} className="jn__chip" layout initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35 }}>
                            {it}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                      {items.length === 0 && <span className="jn__none">{done ? 'Nothing specific shared' : 'Not yet discussed'}</span>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          {copilot && !safe && (
            <div className="jn__pulse">
              <div>
                <small>Mood</small>
                <b>{copilot.sentiment.label}</b>
                <span>{copilot.sentiment.emotion}</span>
              </div>
              <div>
                <small>Interest</small>
                <b>{copilot.buyingSignal.level}</b>
                <span>{copilot.buyingSignal.score} / 100</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

/** The conversation as chat bubbles: Juno on the left, the customer on the right. */
export function JunoTranscript({ turns }: { turns: Juno['turns'] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [turns.length])
  return (
    <div className="glass-card jn-chat">
      <div className="glass-card__label">Conversation</div>
      {turns.length === 0 ? (
        <p className="panel-empty">The conversation between Juno and the customer appears here as it happens.</p>
      ) : (
        <div className="jn-chat__list" ref={ref}>
          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.div key={t.id} className={`jn-bubble jn-bubble--${t.role}`} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3 }}>
                <small>{t.role === 'juno' ? 'Juno' : 'Customer'}</small>
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

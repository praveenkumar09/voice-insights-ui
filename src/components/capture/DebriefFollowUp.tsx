import { useCallback, useEffect, useRef, useState } from 'react'
import { junoFollowUp, type FollowUpDraft, type LangId } from '../../api/client'
import { LANGUAGES } from '../../hooks/useJuno'

interface Props {
  profileId: string
}

/**
 * The follow-up message for the customer, drafted from the debrief the moment it ends, in English, Mandarin, Malay or Tamil.
 * It is only a draft: the advisor reads it, can edit it, and sends it themselves. Nothing is sent from here.
 */
export function DebriefFollowUp({ profileId }: Props) {
  const [lang, setLang] = useState<LangId>('en')
  const [draft, setDraft] = useState<FollowUpDraft | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const cache = useRef(new Map<LangId, FollowUpDraft>())
  const wanted = useRef<LangId>('en')

  const load = useCallback(
    async (l: LangId) => {
      wanted.current = l
      const hit = cache.current.get(l)
      if (hit) {
        setDraft(hit)
        setText(hit.message)
        setLoading(false)
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const d = await junoFollowUp(profileId, l)
        cache.current.set(l, d)
        if (wanted.current !== l) return // the advisor already chose another language
        setDraft(d)
        setText(d.message)
      } catch (e) {
        if (wanted.current === l) setError(e instanceof Error ? e.message : 'Could not draft the follow-up')
      } finally {
        if (wanted.current === l) setLoading(false)
      }
    },
    [profileId],
  )

  useEffect(() => {
    void load('en')
  }, [load])

  function choose(l: LangId) {
    if (l === lang) return
    setLang(l)
    setCopied(false)
    void load(l)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the text stays selectable on screen.
    }
  }

  return (
    <div className="glass-card fu">
      <div className="fu__head">
        <div>
          <div className="glass-card__label">Follow-up for the customer</div>
          <p className="fu__sub">A draft from this debrief, ready the moment you finish. You review it and send it yourself.</p>
        </div>
        <div className="fu__langs" role="group" aria-label="Language of the message">
          {LANGUAGES.map((l) => (
            <button key={l.id} className={lang === l.id ? 'is-on' : ''} aria-pressed={lang === l.id} title={l.name} onClick={() => choose(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="fu__loading" aria-live="polite">
          <span className="fu__dots"><i /><i /><i /></span> Drafting the message{lang === 'en' ? '' : ` in ${LANGUAGES.find((x) => x.id === lang)?.name}`}…
        </div>
      )}
      {error && !loading && (
        <div className="fu__error">
          {error} <button onClick={() => { cache.current.delete(lang); void load(lang) }}>Try again</button>
        </div>
      )}
      {draft && !loading && !error && (
        <>
          <textarea className="fu__text" value={text} onChange={(e) => setText(e.target.value)} rows={7} aria-label="Follow-up message draft" lang={lang} />
          {lang !== 'en' && (
            <details className="fu__check">
              <summary>Check what it says in English</summary>
              <p>{draft.english}</p>
            </details>
          )}
          <div className="fu__actions">
            <button className="cta-btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy message'}</button>
            <small>Never contains prices, returns or product names. Edit freely before sending.</small>
          </div>
        </>
      )}
    </div>
  )
}

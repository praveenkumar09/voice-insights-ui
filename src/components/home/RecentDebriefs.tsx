import { useEffect, useState } from 'react'
import { getMemoryBriefFor, type MemoryCandidate } from '../../api/client'
import { useJunoMode } from '../juno/mode/JunoMode'
import { refreshRecent, useRecentCustomers } from '../../utils/recentCustomers'

/**
 * The customers the advisor debriefed most recently, as a rail of round avatars. The ring says whether suggestions are ready (crimson) or it is
 * a debrief only (grey); the dots under a name are how many debriefs there are of that person. Choosing one shows who they are in a single
 * panel with a Brief me button: the same briefing as "Hey Spark, brief me on Priya". Hidden until there is at least one.
 */
export function RecentDebriefs() {
  const people = useRecentCustomers()
  const j = useJunoMode()
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void refreshRecent() }, [])
  if (people.length === 0) return null

  const current = people.find((c) => c.id === picked) ?? people[0]
  const labels = shortNames(people)

  const brief = async (c: MemoryCandidate) => {
    setBusy(true)
    setError(null)
    try {
      const r = await getMemoryBriefFor(c.id)
      if (!r.reading) throw new Error('I couldn’t put a brief together for that.')
      await j.readLoaded(r.reading)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'I couldn’t start that briefing.')
    } finally {
      setBusy(false)
    }
  }

  const move = (from: number, by: number) => {
    const next = people[(from + by + people.length) % people.length]
    setPicked(next.id)
    document.getElementById(`recent-${next.id}`)?.focus()
  }

  return (
    <section className="recent" aria-labelledby="recent-title">
      <header className="recent__head">
        <h3 id="recent-title">Recently debriefed</h3>
        <p>Choose someone and tap Brief me, or say “Hey Spark, brief me on {people[0].name.trim().split(/\s+/)[0]}”.</p>
      </header>

      <div className="recent__rail" role="radiogroup" aria-label="Recently debriefed customers">
        {people.map((c, i) => {
          const on = c.id === current.id
          return (
            <button
              key={c.id}
              id={`recent-${c.id}`}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={`recent__who${on ? ' is-on' : ''}${c.hasSuggestions ? ' is-ready' : ''}`}
              onClick={() => setPicked(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1) }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1) }
              }}
            >
              <span className="recent__ring"><span className="recent__face">{c.name.trim()[0]?.toUpperCase()}</span></span>
              <span className="recent__name">{labels[i]}</span>
              <span className="recent__when">{c.lastDebriefSpoken.replace(/^on /, '')}</span>
            </button>
          )
        })}
      </div>

      <div className="recent__focus" key={current.id} aria-live="polite">
        <div className="recent__facts">
          <strong>{current.name}</strong>
          <span>{[current.age, current.occupation].filter(Boolean).join(' · ') || 'Details not captured'}</span>
        </div>
        <div className="recent__history" title={`${current.debriefs} debrief${current.debriefs === 1 ? '' : 's'}`}>
          <span className="recent__dots" aria-hidden>
            {Array.from({ length: Math.min(current.debriefs, 8) }, (_, i) => <i key={i} />)}
          </span>
          <span>{current.debriefs === 1 ? 'Debriefed' : `${current.debriefs} debriefs, last`} {current.lastDebriefSpoken}</span>
        </div>
        <span className={`recent__state${current.hasSuggestions ? ' is-ready' : ''}`}>{current.hasSuggestions ? 'Suggestions ready' : 'Debrief only'}</span>
        <button type="button" className="recent__play" onClick={() => brief(current)} disabled={busy || !!j.reading} aria-label={`Brief me on ${current.name}`}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10-6.4a1 1 0 0 0 0-1.72l-10-6.4A1 1 0 0 0 8 5.6Z" fill="currentColor" /></svg>
          {busy ? 'Getting it…' : 'Brief me'}
        </button>
      </div>
      {error && <p className="recent__error" role="alert">{error}</p>}
    </section>
  )
}

/** First names for the rail; two people with the same first name get their surname's initial ("David T."), so they can be told apart. */
function shortNames(people: MemoryCandidate[]): string[] {
  const first = (n: string) => n.trim().split(/\s+/)[0]
  const count = new Map<string, number>()
  people.forEach((c) => count.set(first(c.name).toLowerCase(), (count.get(first(c.name).toLowerCase()) ?? 0) + 1))
  return people.map((c) => {
    const parts = c.name.trim().split(/\s+/)
    return (count.get(parts[0].toLowerCase()) ?? 0) > 1 && parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  })
}

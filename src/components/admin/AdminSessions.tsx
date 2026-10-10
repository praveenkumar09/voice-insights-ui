import { useEffect, useState, type CSSProperties } from 'react'
import { listCustomers } from '../../api/client'
import type { CustomerSummary } from '../../types'
import { initials, timeAgo } from './format'

const PAGE_SIZE = 10

interface Props {
  onViewRun: (runId: string) => void
}

/** Every captured conversation and where it got to — the same look as the dashboard. */
export function AdminSessions({ onViewRun }: Props) {
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<CustomerSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listCustomers(page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
        setError(null)
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load voice sessions'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [page])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className={`adm-dash${loading && items.length ? ' is-loading' : ''}`}>
      <header className="adm-hero adm-hero--compact">
        <div className="adm-hero__glow adm-hero__glow--a" />
        <div className="adm-hero__top">
          <div>
            <span className="adm-hero__eyebrow">Voice sessions</span>
            <h2>Every conversation, and where it got to</h2>
          </div>
          <div className="adm-hero__count"><b>{total.toLocaleString()}</b><span>sessions captured</span></div>
        </div>
      </header>

      {error && <p className="adm-error">{error}</p>}
      {!items.length && loading && <p className="adm-status">Loading sessions…</p>}

      {items.length > 0 && (
        <section className="adm-card adm-sessions">
          <ul>
            <li className="adm-sessions__head">
              <span>Customer</span><span>Captured</span><span>How</span><span>Profile</span><span>Suggestion</span><span />
            </li>
            {items.map((row, i) => {
              const p = row.profile
              return (
                <li key={p.id} className="adm-rise" style={{ '--i': i } as CSSProperties}>
                  <span className="adm-sessions__who">
                    <i>{initials(p.customerName)}</i>
                    <span><b>{p.customerName ?? 'Unnamed'}</b><small>{p.occupation ?? 'Occupation not captured'}</small></span>
                  </span>
                  <span className="adm-sessions__when">
                    <b>{p.createdAt ? timeAgo(p.createdAt) : '—'}</b>
                    <small>{p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}</small>
                  </span>
                  <span><em className={`adm-chip adm-chip--${p.captureMode === 'DEBRIEF' || p.captureMode === 'JUNO_DEBRIEF' ? 'debrief' : 'live'}`}>{p.captureMode === 'JUNO_DEBRIEF' ? 'With Juno' : p.captureMode === 'DEBRIEF' ? 'Dictated' : 'Live'}</em></span>
                  <span><Pill value={p.status} /></span>
                  <span><Pill value={row.latestRunStatus} /></span>
                  <span>{row.latestRunId && <button className="adm-open" onClick={() => onViewRun(row.latestRunId!)}>Open</button>}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="adm-card adm-empty-card"><strong>No voice sessions yet.</strong><p>Capture a conversation on the Home page and it appears here.</p></div>
      )}

      <div className="adm-pager">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Previous</button>
        <span>Page {page + 1} of {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>
    </div>
  )
}

function Pill({ value }: { value?: string | null }) {
  if (!value) return <em className="adm-pill adm-pill--none">—</em>
  const v = value.toLowerCase()
  const tone = v === 'completed' || v === 'finalized' ? 'good' : v === 'failed' ? 'crit' : v === 'running' || v === 'in_progress' ? 'busy' : 'none'
  const icon = tone === 'good' ? '✓' : tone === 'crit' ? '✕' : tone === 'busy' ? '●' : '○'
  return <em className={`adm-pill adm-pill--${tone}`}><i aria-hidden>{icon}</i>{value.replace('_', ' ').toLowerCase()}</em>
}

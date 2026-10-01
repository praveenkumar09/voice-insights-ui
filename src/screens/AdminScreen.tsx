import { useEffect, useState } from 'react'
import { listCustomers } from '../api/client'
import { AnalyticsDashboard } from '../components/insights/AnalyticsDashboard'
import type { CustomerSummary } from '../types'

interface Props {
  onBack: () => void
  onViewRun: (runId: string) => void
}

const PAGE_SIZE = 10

export function AdminScreen({ onBack, onViewRun }: Props) {
  const [tab, setTab] = useState<'dashboard' | 'sessions'>('dashboard')
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
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load voice sessions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="admin-screen">
      <button className="back-btn" onClick={onBack}>
        &larr; Back
      </button>
      <h2 className="admin-screen__title">Admin</h2>
      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'dashboard'} className={tab === 'dashboard' ? 'is-active' : ''} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'is-active' : ''} onClick={() => setTab('sessions')}>
          Voice sessions
        </button>
      </div>

      {tab === 'dashboard' && <AnalyticsDashboard onViewRun={onViewRun} />}

      {tab === 'sessions' && <>
      <p className="admin-screen__subtitle">Every captured conversation and its recommendation run.</p>

      {loading && <p className="admin-screen__status">Loading&hellip;</p>}
      {error && <p className="admin-screen__status admin-screen__status--error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="admin-table-wrap glass-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Occupation</th>
                  <th>Profile Status</th>
                  <th>Captured</th>
                  <th>Recommendation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.profile.id}>
                    <td>{row.profile.customerName ?? <span className="admin-table__muted">Unnamed</span>}</td>
                    <td>{row.profile.occupation ?? <span className="admin-table__muted">&mdash;</span>}</td>
                    <td>
                      <StatusPill value={row.profile.status} />
                    </td>
                    <td>{row.profile.createdAt ? new Date(row.profile.createdAt).toLocaleString() : '—'}</td>
                    <td>
                      <StatusPill value={row.latestRunStatus} />
                    </td>
                    <td>
                      {row.latestRunId && (
                        <button className="admin-table__view-btn" onClick={() => onViewRun(row.latestRunId!)}>
                          View Recommendation
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="admin-table__empty">
                      No voice sessions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page + 1} of {totalPages} &middot; {total} total
            </span>
            <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}
      </>}
    </section>
  )
}

function StatusPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="admin-table__muted">&mdash;</span>
  return <span className={`status-pill status-pill--${value.toLowerCase()}`}>{value}</span>
}

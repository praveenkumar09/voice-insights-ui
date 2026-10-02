export const initials = (name?: string | null) => (name ?? '?').trim().charAt(0).toUpperCase() || '?'

/** "praveen@aia.com" → "praveen" — advisors are shown by the part of their sign-in before the @. */
export const shortName = (s?: string | null) => (s ?? 'Unknown').split('@')[0]

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export interface Delta {
  /** rounded percent change, or null when there is no earlier figure to compare with */
  pct: number | null
  dir: 'up' | 'down' | 'flat' | 'new'
}

export function delta(cur: number, prev?: number | null): Delta {
  if (prev == null) return { pct: null, dir: 'flat' }
  if (prev === 0) return cur === 0 ? { pct: 0, dir: 'flat' } : { pct: null, dir: 'new' }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Round a maximum up to a clean axis number whose half is also clean (4, 8, 10, 20, 50, 100 …). */
export function niceMax(v: number): number {
  if (v <= 4) return 4
  if (v <= 8) return 8
  if (v <= 10) return 10
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 5, 10]) if (v <= m * pow) return m * pow
  return v
}

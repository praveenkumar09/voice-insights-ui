import type { CustomerProfile } from '../types'

/** The manual write-up a debrief replaces: the POC planning assumption (to be measured in the July baseline study). */
export const MANUAL_MINUTES = 45

export function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export type EntityKey = 'customerName' | 'age' | 'occupation' | 'dependents' | 'budgetNotes'

export interface Entity {
  key: EntityKey
  label: string
  value: string
  /** Why this one deserves a second look (speech recognition gets these wrong most often). */
  check?: string
}

/** The names and numbers a debrief heard, which speech recognition gets wrong most often. */
export function entitiesFor(p: CustomerProfile): Entity[] {
  const out: Entity[] = []
  if (p.customerName) out.push({ key: 'customerName', label: 'Name', value: p.customerName, check: 'Check the spelling' })
  if (p.age != null) out.push({ key: 'age', label: 'Age', value: String(p.age) })
  if (p.occupation) out.push({ key: 'occupation', label: 'Occupation', value: p.occupation })
  if (p.dependents != null) out.push({ key: 'dependents', label: 'Dependants', value: String(p.dependents) })
  if (p.budgetNotes) {
    const hasUnit = /(month|year|annual|week|per|a )/i.test(p.budgetNotes)
    out.push({ key: 'budgetNotes', label: 'Budget', value: p.budgetNotes, check: hasUnit ? undefined : 'Check the amount and whether it is monthly or yearly' })
  }
  return out
}

export interface Mark {
  start: number
  end: number
  kind: 'entity' | 'flag'
  /** Entity key, or the index of the compliance flag. */
  ref: string
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Where, in the spoken text, each entity and each risky statement actually sits. Overlaps are dropped; the earlier one wins. */
export function findMarks(text: string, entities: Entity[], flagStatements: string[]): Mark[] {
  const found: Mark[] = []
  const lower = text.toLowerCase()
  for (const e of entities) {
    const v = e.value.trim()
    if (!v) continue
    let idx = -1
    let len = v.length
    if (e.key === 'age' || e.key === 'dependents') {
      const m = new RegExp(`\\b${escapeRe(v)}\\b`).exec(text)
      if (m) { idx = m.index; len = m[0].length }
    } else {
      idx = lower.indexOf(v.toLowerCase())
    }
    if (idx >= 0) found.push({ start: idx, end: idx + len, kind: 'entity', ref: e.key })
  }
  flagStatements.forEach((s, i) => {
    const v = s.trim().replace(/^["“]|["”]$/g, '')
    if (v.length < 4) return
    const idx = lower.indexOf(v.toLowerCase())
    if (idx >= 0) found.push({ start: idx, end: idx + v.length, kind: 'flag', ref: String(i) })
  })
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Mark[] = []
  for (const m of found) {
    if (out.length && m.start < out[out.length - 1].end) continue
    out.push(m)
  }
  return out
}

/** The sentence of the spoken text that mentions this fact, so a ledger row can show where it came from. */
export function quoteFor(text: string, fact: string): string | null {
  if (!text || !fact) return null
  const needle = fact.replace(/\s+(years? old|dependants?)$/i, '').split(/\s·\s/)[0].trim().toLowerCase()
  if (needle.length < 2) return null
  const sentences = text.split(/(?<=[.!?。！？])\s+|\n+/)
  const hit = sentences.find((s) => s.toLowerCase().includes(needle))
  if (!hit) return null
  const q = hit.trim()
  return q.length > 110 ? `${q.slice(0, 107)}…` : q
}

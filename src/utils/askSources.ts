import type { AskSource } from '../api/client'

// How Juno's sources are named, on the chips under an answer and in the advice pack.
export const KIND_LABEL: Record<AskSource['kind'], string> = {
  customer: 'Customer',
  analysis: 'Analysis',
  compliance: 'Compliance',
  document: 'Product document',
}

/** A short, readable name for a source chip: what the source actually is ("Protection gaps", "Existing cover"), or for a document which product and section. */
export function chipLabel(s: AskSource): string {
  if (s.kind === 'document') {
    const m = /^(.+?) \(([^)]*?)\):/.exec(s.text)
    const product = m?.[1]?.replace(/^AIA\s+/i, '').trim()
    const part = m?.[2]?.split('·')[0]?.replace(/[_-]+/g, ' ').trim()
    if (product) return part ? `${product} · ${part}` : product
    if (s.file) return s.file.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')
  }
  if (s.kind === 'analysis' && s.label.startsWith('Analysis of ')) return s.label.slice(12).replace(/^AIA\s+/i, '')
  const head = /^([^:]{3,30}):/.exec(s.text)?.[1]?.trim()
  if (head && s.kind !== 'compliance') return head.replace(/^Suggested (first|second|number \d+)$/i, 'Suggestion')
  if (s.kind === 'customer' && s.label.startsWith('From the')) return 'Advisor’s debrief'
  return s.kind === 'compliance' ? (s.label.replace(/^Compliance (check|issue)$/, 'Compliance')) : KIND_LABEL[s.kind]
}

/** Chip labels for one answer, with a number added where two sources would otherwise read the same. */
export function chipLabels(sources: AskSource[]): Map<string, string> {
  const base = sources.map((s) => ({ id: s.id, label: chipLabel(s) }))
  const seen = new Map<string, number>()
  const total = new Map<string, number>()
  base.forEach((b) => total.set(b.label, (total.get(b.label) ?? 0) + 1))
  const out = new Map<string, string>()
  for (const b of base) {
    const n = (seen.get(b.label) ?? 0) + 1
    seen.set(b.label, n)
    out.set(b.id, (total.get(b.label) ?? 1) > 1 ? `${b.label} ${n}` : b.label)
  }
  return out
}


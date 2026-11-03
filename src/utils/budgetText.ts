/**
 * A budget as the review screen shows it under the label "Budget": without the word "Budget" repeated, but still a sentence that reads
 * right. "Budget for insurance is about THB 8,000 per month" becomes "About THB 8,000 per month, for insurance" (dropping only the leading
 * word left "for insurance is about ...").
 */
export function budgetDisplay(text: string | null | undefined): string {
  const t = (text ?? '').replace(/[.\s]+$/, '')
  const forWhat = t.match(/^budget\s+for\s+(.+?)\s+(?:is|of|around)\s+(.+)$/i)
  if (forWhat) return `${forWhat[2].charAt(0).toUpperCase()}${forWhat[2].slice(1)}, for ${forWhat[1]}`
  return t.replace(/^budget(\s+(is|of|around))?\s+/i, '')
}

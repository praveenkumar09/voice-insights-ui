/** Words that name a relationship rather than a person — these stay lower case ("for daughter"). */
const RELATIONS = new Set([
  'wife', 'husband', 'spouse', 'partner', 'daughter', 'daughters', 'son', 'sons', 'child', 'children', 'kid', 'kids', 'baby',
  'mother', 'father', 'mum', 'mom', 'dad', 'parent', 'parents', 'sibling', 'brother', 'sister', 'grandmother', 'grandfather',
  'family', 'self', 'and', '&',
])

/**
 * Who a goal or worry is for, tidied for display: names get capital letters, relationships stay lower case.
 * "meera and anika" → "Meera and Anika", "daughter" → "daughter", "mei-ling" → "Mei-Ling".
 */
export function forLabel(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase()
      if (RELATIONS.has(lower)) return lower
      return lower.replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    })
    .join(' ')
}

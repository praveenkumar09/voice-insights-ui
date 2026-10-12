import type { WhatIfChange } from '../api/client'

/** One changed fact in words: "Dependants: 2 → 3", "Add: …", "Remove: …". */
export function changeText(c: WhatIfChange): string {
  if (c.op === 'remove') return `Remove: ${c.from}`
  if (c.op === 'add') return `Add: ${c.to}`
  return `${c.from} → ${c.to}`
}

/** The same with what changed in front: "Dependants: 2 → 3". */
export function changeLine(c: WhatIfChange): string {
  return c.op === 'set' ? `${c.label}: ${changeText(c)}` : `${c.label} — ${changeText(c)}`
}

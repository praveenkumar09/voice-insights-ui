import { useSyncExternalStore } from 'react'
import { getRecentDebriefs, type MemoryCandidate } from '../api/client'

/**
 * The people the advisor debriefed most recently, kept for the whole app: the home page shows them as cards, and Spark mode lists their first
 * names to the speech recogniser so "brief me on Priya" is heard as Priya and not as something that sounds like it.
 */
let current: MemoryCandidate[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export async function refreshRecent(): Promise<void> {
  try {
    current = await getRecentDebriefs(8)
    emit()
  } catch {
    // Not being able to list them is fine: the cards simply do not appear, and asking Spark by name still works.
  }
}

export function clearRecent(): void {
  current = []
  emit()
}

export function useRecentCustomers(): MemoryCandidate[] {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current)
}

/** First names of the recent customers, once each, for the speech recogniser's vocabulary. */
export function recentFirstNames(): string[] {
  const seen = new Set<string>()
  for (const c of current) {
    const first = c.name.trim().split(/\s+/)[0]
    if (first && first.length >= 2) seen.add(first)
  }
  return [...seen].slice(0, 8)
}

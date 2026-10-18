import { useSyncExternalStore } from 'react'

/**
 * The suggestion run the advisor last looked at, remembered so Juno can brief them on it from anywhere in the app ("Hey Juno, brief me")
 * without having to be on that page.
 */
export interface LastRun {
  runId: string
  name: string
}

const KEY = 'vi_last_run'
const listeners = new Set<() => void>()

function load(): LastRun | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v.runId === 'string' ? { runId: v.runId, name: String(v.name ?? 'the customer') } : null
  } catch {
    return null
  }
}

let current: LastRun | null = load()

export function rememberRun(runId: string, name: string | null | undefined) {
  const n = name?.trim() || 'the customer'
  if (current?.runId === runId && current.name === n) return
  current = { runId, name: n }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* not remembering is fine */ }
  listeners.forEach((l) => l())
}

export function useLastRun(): LastRun | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => current)
}

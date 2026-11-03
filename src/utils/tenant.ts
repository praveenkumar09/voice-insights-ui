import { useSyncExternalStore } from 'react'
import { getSettings, type AppSettings, type BusinessUnitInfo, type LangId } from '../api/client'

/**
 * The business unit and languages an admin has set up. One copy for the whole app: components read it with useTenant(), plain
 * functions (PDF builders, formatters) with tenant(). Until the settings arrive the app behaves as AIA Singapore with every language,
 * which is also what it did before this setting existed.
 */
const SINGAPORE: BusinessUnitInfo = {
  id: 'sg', name: 'AIA Singapore', country: 'Singapore', currency: 'SGD', symbol: 'S$', perSgd: 1,
  incomeExample: 'S$6,000–8,000 / month', budgetExample: 'S$400 a month', defaultLanguages: ['en', 'zh', 'ms', 'ta', 'th', 'fil', 'vi'],
}
const ALL_LANGUAGES: LangId[] = ['en', 'zh', 'ms', 'ta', 'th', 'fil', 'vi']

const FALLBACK: AppSettings = { businessUnit: 'sg', unit: SINGAPORE, languages: ALL_LANGUAGES, updatedAt: null, units: [SINGAPORE], available: [], minLanguages: 1 }

let state: AppSettings = FALLBACK
const listeners = new Set<() => void>()

export const tenant = (): AppSettings => state
export const unit = (): BusinessUnitInfo => state.unit

export function setTenant(next: AppSettings): void {
  state = next
  listeners.forEach((l) => l())
}

export async function loadTenant(): Promise<void> {
  try { setTenant(await getSettings()) } catch { /* keep what we have: Singapore, every language */ }
}

export function useTenant(): AppSettings {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, tenant)
}

/** The language a screen starts in when its current one is not on: English when it is, otherwise the first that is. */
export const fallbackLanguage = (): LangId => (state.languages.includes('en') ? 'en' : state.languages[0] ?? 'en')
export const languageOn = (l: LangId): boolean => state.languages.includes(l)

/** An amount in the selected unit's currency: "S$100,000" for Singapore, "THB 2,600,000" for the others (the code is unambiguous across the region). */
export function money(n: number, currency?: string | null): string {
  const code = currency ?? 'SGD' // records made before business units existed have no currency: they are SGD
  const v = Math.round(n).toLocaleString('en-US')
  return code === 'SGD' ? `S$${v}` : `${code} ${v}`
}

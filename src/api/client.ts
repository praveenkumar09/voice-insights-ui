import type { CustomerProfile, CustomerSummary, PageResult, RecommendationRunView } from '../types'

const API_BASE = (import.meta.env.VITE_VOICE_API_BASE_URL as string | undefined) ?? 'http://localhost:8084'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

const TOKEN_KEY = 'vi_session_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Private/blocked storage — session just won't persist across reloads.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to clean up if storage isn't available in the first place.
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { 'X-Session-Token': token } : {}
}

/** Appends the session token as a query param for URLs handed to browser APIs
 *  (EventSource, anchor download) that can't attach a custom header. */
function withTokenParam(url: string): string {
  const token = getToken()
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return typeof body?.error === 'string' ? body.error : fallback
  } catch {
    return fallback
  }
}

export function wsVoiceUrl(): string {
  return `${WS_BASE}/ws/voice`
}

export async function signup(email: string, password: string): Promise<{ token: string; email: string }> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to sign up (${res.status})`))
  return res.json()
}

export async function resetPassword(email: string, newPassword: string, confirmPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, newPassword, confirmPassword }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to reset password (${res.status})`))
}

export async function login(email: string, password: string): Promise<{ token: string; email: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to sign in (${res.status})`))
  return res.json()
}

export async function me(): Promise<{ email: string }> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: authHeaders() })
}

export async function saveCustomerProfile(profile: CustomerProfile): Promise<CustomerProfile> {
  const res = await fetch(`${API_BASE}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(profile),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to save customer profile (${res.status})`))
  return res.json()
}

export async function getCustomerProfile(customerId: string): Promise<CustomerProfile> {
  const res = await fetch(`${API_BASE}/api/customers/${customerId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to fetch customer profile (${res.status})`))
  return res.json()
}

export async function startRecommendations(customerId: string): Promise<{ runId: string }> {
  const res = await fetch(`${API_BASE}/api/customers/${customerId}/recommendations`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to start recommendations (${res.status})`))
  return res.json()
}

export function recommendationStreamUrl(runId: string): string {
  return withTokenParam(`${API_BASE}/api/recommendations/${runId}/stream`)
}

export async function getRecommendationRun(runId: string): Promise<RecommendationRunView> {
  const res = await fetch(`${API_BASE}/api/recommendations/${runId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to fetch recommendation run (${res.status})`))
  return res.json()
}

export function recommendationReportUrl(runId: string): string {
  return withTokenParam(`${API_BASE}/api/recommendations/${runId}/report`)
}

export async function listCustomers(page: number, size: number): Promise<PageResult<CustomerSummary>> {
  const res = await fetch(`${API_BASE}/api/admin/customers?page=${page}&size=${size}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to list customers (${res.status})`))
  return res.json()
}

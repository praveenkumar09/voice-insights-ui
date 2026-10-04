import type { AdvicePack, AdvicePackSection, AdvicePackView, AnalyticsResult, CopilotInsights, CustomerProfile, LifeMapData, ProposalResult, ProtectionStory, CustomerSummary, PageResult, RecommendationRunView } from '../types'

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

export function wsVoiceUrl(mode: 'live' | 'debrief' | 'juno' = 'live'): string {
  return `${WS_BASE}/ws/voice${mode === 'live' ? '' : `?mode=${mode}`}`
}

export type LangId = 'en' | 'zh' | 'ms' | 'ta'

export interface JunoPhrases {
  language: string
  greeting: string
  declined: string
  unclear: string
  firstQuestion: string
  closing: string
  wrap: string
  askAway: string
  tellMore: string
  noFigures: string
  nudge: string
  missed: string
  anythingElse: string
  yes: string
  no: string
  yesText: string
  noText: string
  acks: string[]
}

export interface JunoTurnRequest {
  profileId?: string | null
  phase: 'consent' | 'discovery'
  turns: { role: 'juno' | 'customer'; text: string }[]
  lang?: LangId
  /** How far the fixed parts of the conversation have gone (the server cannot read these from non-English text). */
  consentAsks?: number
  closingAsked?: boolean
  qaAnswers?: number
}

export interface JunoTurnResponse {
  say: string
  consent: 'granted' | 'declined' | 'unclear' | null
  covered: string[]
  done: boolean
  stage: 'consent' | 'discovery' | 'wrapup' | 'declined'
  /** How the line should sound: warm, gentle, upbeat, curious or reassuring. */
  tone?: string
  /** 'closing' = this is the closing question; 'qa' = this answers a customer question. */
  marker?: 'closing' | 'qa' | null
  /** The question invites a long answer (so longer pauses are allowed). */
  open?: boolean | null
}

export type JunoTone = 'warm' | 'gentle' | 'upbeat' | 'curious' | 'reassuring'

/** Is Juno's neural voice available? (If not, the browser's own voice is used.) */
export async function junoVoiceStatus(): Promise<{ enabled: boolean; voices: { female: string; male: string } }> {
  try {
    const res = await fetch(`${API_BASE}/api/juno/voice`, { headers: authHeaders() })
    if (res.ok) return res.json()
  } catch {
    // fall through
  }
  return { enabled: false, voices: { female: 'coral', male: 'ash' } }
}

/** One spoken line as audio (MP3), or null if the neural voice could not produce it. */
export async function junoSpeak(text: string, voice: 'female' | 'male', tone: string, lang: LangId = 'en'): Promise<Blob | null> {
  try {
    const res = await fetch(`${API_BASE}/api/juno/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text, voice, tone, lang }),
    })
    return res.ok ? await res.blob() : null
  } catch {
    return null
  }
}

/** What Juno should say next. This is the only thing the endpoint does — it cannot start an analysis. */
export async function junoTurn(req: JunoTurnRequest): Promise<JunoTurnResponse> {
  const res = await fetch(`${API_BASE}/api/juno/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Juno could not respond (${res.status})`))
  return res.json()
}

/** The customer declined consent: remove everything captured from the unfinished conversation. */
export async function discardConversation(customerId: string): Promise<void> {
  await fetch(`${API_BASE}/api/customers/${encodeURIComponent(customerId)}`, { method: 'DELETE', headers: authHeaders() })
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

export async function updateTranscript(
  customerId: string,
  transcript: string,
): Promise<{ profile: CustomerProfile; copilot: CopilotInsights | null }> {
  const res = await fetch(`${API_BASE}/api/customers/${customerId}/transcript`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ transcript }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to save transcript (${res.status})`))
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

export async function generateProposal(runId: string, language: string): Promise<ProposalResult> {
  const res = await fetch(`${API_BASE}/api/recommendations/${runId}/proposal?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to generate proposal (${res.status})`))
  return res.json()
}

export async function getAnalytics(days: number): Promise<AnalyticsResult> {
  const res = await fetch(`${API_BASE}/api/admin/analytics?days=${days}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to load analytics (${res.status})`))
  return res.json()
}

export async function generateStory(runId: string): Promise<ProtectionStory> {
  const res = await fetch(`${API_BASE}/api/recommendations/${runId}/story`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to generate the story (${res.status})`))
  return res.json()
}

export async function updateLifeMap(customerId: string, map: LifeMapData): Promise<CopilotInsights> {
  const res = await fetch(`${API_BASE}/api/customers/${customerId}/lifemap`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(map),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to save the Life Map (${res.status})`))
  return res.json()
}

// ── Advice pack ─────────────────────────────────────────────────────────

const advicePackUrl = (runId: string) => `${API_BASE}/api/recommendations/${runId}/advice-pack`

export async function getAdvicePack(runId: string): Promise<AdvicePackView> {
  const res = await fetch(advicePackUrl(runId), { headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to load the advice pack (${res.status})`))
  return res.json()
}

export async function generateAdvicePack(runId: string, tone = 'warm'): Promise<AdvicePack> {
  const res = await fetch(`${advicePackUrl(runId)}?tone=${encodeURIComponent(tone)}`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to generate the advice pack (${res.status})`))
  return res.json()
}

export async function regenerateAdviceSection(runId: string, section: AdvicePackSection, tone?: string): Promise<AdvicePack> {
  const q = tone ? `?tone=${encodeURIComponent(tone)}` : ''
  const res = await fetch(`${advicePackUrl(runId)}/section/${section}${q}`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to regenerate this section (${res.status})`))
  return res.json()
}

export async function saveAdvicePack(runId: string, pack: AdvicePack): Promise<AdvicePack> {
  const res = await fetch(advicePackUrl(runId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(pack),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to save your changes (${res.status})`))
  return res.json()
}

export async function reviewAdvicePack(runId: string): Promise<AdvicePack> {
  const res = await fetch(`${advicePackUrl(runId)}/review`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to record the sign-off (${res.status})`))
  return res.json()
}

/** Juno's fixed lines (greeting, consent questions, goodbyes, acknowledgements) in a language. */
export async function junoPhrases(lang: LangId): Promise<JunoPhrases | null> {
  try {
    const res = await fetch(`${API_BASE}/api/juno/phrases?lang=${lang}`, { headers: authHeaders() })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

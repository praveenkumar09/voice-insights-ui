export interface CustomerProfile {
  id?: string
  agentUserId?: string
  status?: string
  customerName?: string | null
  age?: number | null
  occupation?: string | null
  incomeBand?: string | null
  dependents?: number | null
  existingPolicies?: string[]
  goalsAndConcerns?: string[]
  budgetNotes?: string | null
  notes?: string | null
  rawTranscript?: string | null
  liveInsights?: { latest: CopilotInsights; history: SignalPoint[] } | null
  createdAt?: string
  updatedAt?: string
}

export interface CustomerSummary {
  profile: CustomerProfile
  latestRunId: string | null
  latestRunStatus: string | null
}

export interface PageResult<T> {
  items: T[]
  page: number
  size: number
  total: number
}

export interface NeedAnalysisResult {
  protectionGaps: string[]
  recommendedCategories: string[]
  matchedProductNames: string[]
  rationale: string
}

export interface RiskAnalysisResult {
  riskFactors: string[]
  riskLevel: string
  rationale: string
}

export interface AffordabilityResult {
  estimatedBudgetBand: string
  affordablePremiumRange: string
  rationale: string
}

export interface MergedInsights {
  needs: NeedAnalysisResult
  risks: RiskAnalysisResult
  affordability: AffordabilityResult
  combinedNarrative: string
}

export interface CustomerPersonaResult {
  personaLabel: string
  lifeStage: string
  characteristics: string[]
  rationale: string
}

export interface ProductScore {
  productName: string
  score: number
  matchReasons: string[]
  concerns: string[]
}

export interface ProductScoringResult {
  scores: ProductScore[]
  methodology: string
}

export interface ProductShortlistResult {
  shortlistedProducts: string[]
  rationale: string
}

export interface EvidenceCitation {
  productName: string
  docCategory: string
  sourceFile: string
  excerpt: string
}

export interface RagValidationResult {
  citations: EvidenceCitation[]
  allClaimsSupported: boolean
  notes: string
}

export interface RecommendationSummaryResult {
  customerFacingSummary: string
  keyTalkingPoints: string[]
}

export interface ComplianceCheckItem {
  check: string
  passed: boolean
  note: string
}

export interface ComplianceCheckResult {
  compliant: boolean
  checks: ComplianceCheckItem[]
  issues: string[]
  rationale: string
}

export interface SalesReportResult {
  title: string
  reportMarkdown: string
}

/** Every LangGraph4j pipeline node, in execution order. 'merge' is the fan-in synthesis step. */
export type AgentKey =
  | 'need'
  | 'risk'
  | 'affordability'
  | 'merge'
  | 'persona'
  | 'productScoring'
  | 'productShortlist'
  | 'ragValidation'
  | 'summary'
  | 'complianceCheck'
  | 'salesReport'

export type AgentStatus = 'idle' | 'running' | 'done' | 'failed'

export type RecommendationEventType = 'run_started' | 'agent_started' | 'agent_completed' | 'agent_failed' | 'run_failed'

export interface RecommendationEvent {
  type: RecommendationEventType
  agent: AgentKey | null
  payload: unknown
}

export interface AgentStepView {
  agentKey: AgentKey
  status: string
  input: unknown
  output: unknown
}

export interface RecommendationRunView {
  runId: string
  customerProfileId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  steps: AgentStepView[]
  errorMessage: string | null
}

export interface CopilotNeed {
  label: string
  strength: number
}

export interface CopilotInsights {
  needs: CopilotNeed[]
  sentiment: { score: number; label: string; emotion: string }
  buyingSignal: { score: number; level: string; signals: string[] }
  nextQuestions: string[]
  complianceFlags: { severity: string; statement: string; advice: string }[]
  productMatches: { productName: string; fitScore: number; evidence: string; source: string }[]
}

/** One point on the live sentiment / buying-signal timeline. */
export interface SignalPoint {
  sentiment: number
  buying: number
}

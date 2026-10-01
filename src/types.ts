export interface CustomerProfile {
  id?: string
  agentUserId?: string
  status?: string
  captureMode?: 'LIVE' | 'DEBRIEF'
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

export interface ProposalProduct {
  name: string
  fitScore: number
  whyItFits: string
  keyBenefits: string[]
  indicativePremium: string
  source: string
}

export interface ProposalResult {
  language: 'en' | 'zh' | 'ms' | 'ta'
  title: string
  greeting: string
  summary: string
  products: ProposalProduct[]
  nextSteps: string[]
  followUpMessage: string
  disclaimer: string
  review: { passed: boolean; notes: string[] }
}

export interface PlanGoal {
  label: string
  forRelation: string
  support: string
  products: string[]
  said: string | null
}

export interface ProtectionStory {
  headline: string
  opening: string
  quotes: { text: string; theme: string }[]
  monthlyIncome: number | null
  /** Sum-assured figures found in product documents — used only in the advisor's own adequacy check. */
  products: { name: string; benefitAmount: number | null; benefitNote: string | null }[]
  closing: string
  /** Absent on stories created before "Goals and plan" existed. */
  goals?: PlanGoal[]
  /** Compliance reviewer's verdict; absent on stories created before the review existed. */
  review?: { passed: boolean; notes: string[] } | null
}

export interface SalesReportResult {
  title: string
  reportMarkdown: string
  proposal?: ProposalResult | null
  story?: ProtectionStory | null
}

export interface AnalyticsCount {
  label: string
  count: number
  avgStrength: number
}

export interface AnalyticsResult {
  days: number
  totals: { conversations: number; analysed: number; recommendations: number; avgBuyingSignal: number; avgSentiment: number }
  pipeline: { hot: number; warm: number; cold: number }
  sentiment: { positive: number; neutral: number; negative: number }
  compliance: { conversationsWithFlags: number; highRiskFlags: number; cautionFlags: number; reviewedRuns: number; compliantRuns: number }
  topNeeds: AnalyticsCount[]
  topProducts: AnalyticsCount[]
  trend: { date: string; conversations: number; avgBuyingSignal: number }[]
  agents: { agent: string; conversations: number; avgBuyingSignal: number; hotLeads: number; complianceFlags: number }[]
  leadsToFollowUp: { profileId: string; customerName: string | null; buyingSignal: number; topNeed: string | null; latestRunId: string | null; capturedAt: string }[]
  takeaways: string[]
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
  lifeMap?: LifeMapData | null
}

export interface LifeMapPerson {
  relation: string
  name: string | null
  said: string
}

export interface LifeMapConcern {
  label: string
  forRelation: string
  said: string
  idea: { product: string; fit: number; evidence: string } | null
}

export interface LifeMapData {
  people: LifeMapPerson[]
  dreams: LifeMapConcern[]
  worries: LifeMapConcern[]
}

/** One point on the live sentiment / buying-signal timeline. */
export interface SignalPoint {
  sentiment: number
  buying: number
}

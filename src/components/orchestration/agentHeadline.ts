import type {
  AffordabilityResult,
  AgentKey,
  ComplianceCheckResult,
  CustomerPersonaResult,
  MergedInsights,
  NeedAnalysisResult,
  ProductScoringResult,
  ProductShortlistResult,
  RagValidationResult,
  RecommendationSummaryResult,
  RiskAnalysisResult,
  SalesReportResult,
} from '../../types'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s)

/**
 * The one-line takeaway of a finished agent, shown on its card so the outcome is visible without opening it —
 * what an executive scanning the pipeline wants to see.
 */
export function agentHeadline(agent: AgentKey, result: unknown): string | null {
  if (result == null) return null
  try {
    switch (agent) {
      case 'need': {
        const r = result as NeedAnalysisResult
        return r.recommendedCategories?.[0] ? `${r.recommendedCategories.length} needs · ${r.recommendedCategories[0]}` : null
      }
      case 'risk': {
        const r = result as RiskAnalysisResult
        return `${r.riskLevel} risk${r.riskFactors?.[0] ? ` · ${clip(r.riskFactors[0], 48)}` : ''}`
      }
      case 'affordability': {
        const r = result as AffordabilityResult
        return r.affordablePremiumRange ? `Comfortable range · ${r.affordablePremiumRange}` : null
      }
      case 'merge': {
        const r = result as MergedInsights
        return r.combinedNarrative ? clip(r.combinedNarrative.split(/(?<=[.!?])\s/)[0], 64) : null
      }
      case 'persona': {
        const r = result as CustomerPersonaResult
        return `${r.personaLabel} · ${r.lifeStage}`
      }
      case 'productScoring': {
        const r = result as ProductScoringResult
        const top = [...(r.scores ?? [])].sort((a, b) => b.score - a.score)[0]
        return top ? `${r.scores.length} products ranked · best ${top.score}% ${top.productName}` : null
      }
      case 'productShortlist': {
        const r = result as ProductShortlistResult
        return r.shortlistedProducts?.length ? r.shortlistedProducts.join(' · ') : null
      }
      case 'ragValidation': {
        const r = result as RagValidationResult
        return `${r.citations?.length ?? 0} citations · ${r.allClaimsSupported ? 'every claim supported' : 'some claims need review'}`
      }
      case 'complianceCheck': {
        const r = result as ComplianceCheckResult
        const passed = (r.checks ?? []).filter((c) => c.passed).length
        return r.compliant ? `Cleared · ${passed}/${r.checks?.length ?? 0} checks passed` : `Issues raised · ${r.issues?.length ?? 0}`
      }
      case 'summary': {
        const r = result as RecommendationSummaryResult
        return `${r.keyTalkingPoints?.length ?? 0} talking points ready for the advisor`
      }
      case 'salesReport': {
        const r = result as SalesReportResult
        return r.title ? clip(r.title, 70) : 'Advisory report ready'
      }
    }
  } catch {
    return null
  }
  return null
}

import type { AgentKey } from '../../types'

export interface AgentMeta {
  label: string
  purpose: string
  question: string
}

/** Label, purpose and the business question each LangGraph4j node answers — shown on every agent card. */
export const AGENT_META: Record<AgentKey, AgentMeta> = {
  need: {
    label: 'Need Agent',
    purpose: 'Determine customer intentions.',
    question: 'What is the customer looking for?',
  },
  risk: {
    label: 'Risk Agent',
    purpose: 'Identify what could financially affect the customer.',
    question: 'What risk is the customer exposed to?',
  },
  affordability: {
    label: 'Affordability Agent',
    purpose: 'Prevent unsuitable recommendations.',
    question: 'What can this customer realistically afford?',
  },
  merge: {
    label: 'Synthesis Agent',
    purpose: 'Combine need, risk and affordability into one customer picture.',
    question: 'What does the full picture of this customer look like?',
  },
  persona: {
    label: 'Customer Persona Agent',
    purpose: 'Group the customer into a meaningful life-stage segment.',
    question: 'What type of customer is this?',
  },
  productScoring: {
    label: 'Product Scoring Agent',
    purpose: 'Score every product for an unbiased ranking.',
    question: 'Which products are the best fit?',
  },
  productShortlist: {
    label: 'Customer Product Agent',
    purpose: 'Reduce the full catalog to a shortlist.',
    question: 'Which products should we evaluate further?',
  },
  ragValidation: {
    label: 'RAG Validation Agent',
    purpose: 'Validate the recommendation is factually correct against product documents.',
    question: 'What evidence supports this recommendation?',
  },
  complianceCheck: {
    label: 'Compliance Check Agent',
    purpose: 'Act as an automated compliance officer.',
    question: 'Is this recommendation compliant?',
  },
  summary: {
    label: 'Recommendation Summary Agent',
    purpose: 'Convert technical results into an agent-friendly explanation, once compliance has weighed in.',
    question: 'How do I explain this recommendation?',
  },
  salesReport: {
    label: 'Sales Report Generation Agent',
    purpose: 'Convert everything into a single advisory sales report.',
    question: "What's the final advisory report for this customer?",
  },
}

/** The three agents that run in parallel before the fan-in into merge. */
export const PARALLEL_AGENTS: AgentKey[] = ['need', 'risk', 'affordability']

/**
 * The single continuous chain that follows the parallel fan-in — starting
 * with merge/synthesis itself, so the whole pipeline reads as one graph
 * rather than a fan-out section followed by a separate-looking sequence.
 * Compliance runs before the customer-facing summary (see
 * RecommendationAgentService.summarize's Javadoc on the backend).
 */
export const POST_MERGE_AGENTS: AgentKey[] = [
  'merge',
  'persona',
  'productScoring',
  'productShortlist',
  'ragValidation',
  'complianceCheck',
  'summary',
  'salesReport',
]

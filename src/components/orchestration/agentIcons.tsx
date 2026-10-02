import type { AgentKey } from '../../types'

const P: Record<AgentKey, string> = {
  need: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  risk: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zm0 5v4m0 3h.01',
  affordability: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8zm0 2h16m-4 5h.01',
  merge: 'M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5m-18 4l9 5 9-5',
  persona: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20c0-4 3.6-6 8-6s8 2 8 6',
  productScoring: 'M5 20V10m5 10V4m5 16v-7m5 7v-11',
  productShortlist: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  ragValidation: 'M7 3h7l5 5v13H7V3zm7 0v5h5M10 15l2 2 3.5-4',
  complianceCheck: 'M12 3l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.3L12 21l-2.4-2.1-3.2.3-.9-3.1L2.7 14.5l1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.3L12 3zm-3 9l2 2 4-4',
  summary: 'M4 5h16v11H9l-5 4V5zm4 4h8m-8 3h5',
  salesReport: 'M6 3h9l4 4v14H6V3zm3 8h7m-7 3h7m-7 3h4',
}

/** Small stroke icon for each agent — drawn on a 24px grid, coloured by its parent. */
export function AgentIcon({ agent, size = 20 }: { agent: AgentKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[agent]} />
    </svg>
  )
}

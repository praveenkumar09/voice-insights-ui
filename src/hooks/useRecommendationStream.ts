import { useCallback, useRef, useState } from 'react'
import { recommendationStreamUrl, startRecommendations } from '../api/client'
import type { AgentKey, AgentStatus, RecommendationEvent } from '../types'

export interface AgentState {
  status: AgentStatus
  result: unknown
  error: string | null
}

/** Canonical pipeline order — mirrors RecommendationStore.PIPELINE_ORDER on the backend. */
export const PIPELINE_ORDER: AgentKey[] = [
  'need',
  'risk',
  'affordability',
  'merge',
  'persona',
  'productScoring',
  'productShortlist',
  'ragValidation',
  'complianceCheck',
  'summary',
  'salesReport',
]

const TERMINAL_AGENT: AgentKey = 'salesReport'

function idleSteps(): Record<AgentKey, AgentState> {
  return Object.fromEntries(PIPELINE_ORDER.map((key) => [key, { status: 'idle', result: null, error: null }])) as Record<
    AgentKey,
    AgentState
  >
}

export function useRecommendationStream() {
  const [runId, setRunId] = useState<string | null>(null)
  const [steps, setSteps] = useState<Record<AgentKey, AgentState>>(idleSteps)
  const [runFailed, setRunFailed] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const reset = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setRunId(null)
    setSteps(idleSteps())
    setRunFailed(null)
  }, [])

  const applyEvent = useCallback((evt: RecommendationEvent) => {
    const agentKey = evt.agent

    switch (evt.type) {
      case 'agent_started':
        if (agentKey) {
          setSteps((prev) => ({ ...prev, [agentKey]: { status: 'running', result: null, error: null } }))
        }
        break
      case 'agent_completed':
        if (agentKey) {
          setSteps((prev) => ({ ...prev, [agentKey]: { status: 'done', result: evt.payload, error: null } }))
          if (agentKey === TERMINAL_AGENT) eventSourceRef.current?.close()
        }
        break
      case 'agent_failed': {
        const message = (evt.payload as { error?: string } | null)?.error ?? 'Agent failed'
        if (agentKey) {
          setSteps((prev) => ({ ...prev, [agentKey]: { status: 'failed', result: null, error: message } }))
        }
        break
      }
      case 'run_failed':
        setRunFailed((evt.payload as { error?: string } | null)?.error ?? 'Suggestion run failed')
        eventSourceRef.current?.close()
        break
      case 'run_started':
        break
    }
  }, [])

  const start = useCallback(
    async (customerId: string) => {
      reset()
      const { runId: newRunId } = await startRecommendations(customerId)
      setRunId(newRunId)

      const es = new EventSource(recommendationStreamUrl(newRunId))
      eventSourceRef.current = es

      es.onmessage = (event: MessageEvent<string>) => {
        const evt = JSON.parse(event.data) as RecommendationEvent
        applyEvent(evt)
      }
    },
    [applyEvent, reset],
  )

  return { runId, steps, runFailed, start, reset }
}

import { useEffect, useState } from 'react'
import { getCustomerProfile, getRecommendationRun } from '../api/client'
import { RunWorkspace } from '../components/workspace/RunWorkspace'
import { PIPELINE_ORDER } from '../hooks/useRecommendationStream'
import type { AgentState } from '../hooks/useRecommendationStream'
import type { AgentKey, CustomerProfile, RecommendationRunView } from '../types'

interface Props {
  runId: string
  onBack: () => void
}

export function AdminRunDetailScreen({ runId, onBack }: Props) {
  const [run, setRun] = useState<RecommendationRunView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)

  useEffect(() => {
    let cancelled = false
    getRecommendationRun(runId)
      .then((r) => {
        if (cancelled) return
        setRun(r)
        getCustomerProfile(r.customerProfileId).then((p) => !cancelled && setProfile(p)).catch(() => {})
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load suggestion run')
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  return (
    <section className="orchestration-screen">
      <button className="back-btn" onClick={onBack}>
        &larr; Back to admin
      </button>

      {error && <p className="orchestration-screen__error">{error}</p>}
      {!error && !run && <p className="capture-screen__hint">Loading suggestion&hellip;</p>}

      {run && (
        <>
          <RunWorkspace runId={run.runId} steps={toSteps(run)} profile={profile} initialTab="report" runFailed={run.status === 'FAILED' ? run.errorMessage ?? 'Run failed' : null} />
        </>
      )}
    </section>
  )
}

function toSteps(run: RecommendationRunView): Record<AgentKey, AgentState> {
  const byKey = new Map(run.steps.map((s) => [s.agentKey, s]))
  const steps = {} as Record<AgentKey, AgentState>
  for (const key of PIPELINE_ORDER) {
    const row = byKey.get(key)
    steps[key] = row
      ? { status: row.status === 'COMPLETED' ? 'done' : row.status === 'FAILED' ? 'failed' : 'running', result: row.output, error: null }
      : { status: 'idle', result: null, error: null }
  }
  return steps
}

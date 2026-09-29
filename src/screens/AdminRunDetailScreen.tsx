import { useEffect, useState } from 'react'
import { getRecommendationRun } from '../api/client'
import { OrchestratorCanvas } from '../components/orchestration/OrchestratorCanvas'
import { PIPELINE_ORDER } from '../hooks/useRecommendationStream'
import type { AgentState } from '../hooks/useRecommendationStream'
import type { AgentKey, RecommendationRunView } from '../types'

interface Props {
  runId: string
  onBack: () => void
}

export function AdminRunDetailScreen({ runId, onBack }: Props) {
  const [run, setRun] = useState<RecommendationRunView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getRecommendationRun(runId)
      .then((r) => {
        if (!cancelled) setRun(r)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load recommendation run')
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
      {!error && !run && <p className="capture-screen__hint">Loading recommendation&hellip;</p>}

      {run && (
        <>
          <div className="admin-run-detail__meta glass-card">
            <span className="glass-card__label">Run</span>
            <code className="admin-run-detail__run-id">{run.runId}</code>
            <span className={`status-pill status-pill--${run.status.toLowerCase()}`}>{run.status}</span>
          </div>
          <OrchestratorCanvas runId={run.runId} steps={toSteps(run)} />
          {run.errorMessage && <p className="orchestration-screen__error">Run failed: {run.errorMessage}</p>}
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

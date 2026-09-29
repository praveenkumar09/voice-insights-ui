import { useEffect, useRef } from 'react'
import { OrchestratorCanvas } from '../components/orchestration/OrchestratorCanvas'
import { useRecommendationStream } from '../hooks/useRecommendationStream'

interface Props {
  customerId: string
  onBack: () => void
}

export function OrchestrationScreen({ customerId, onBack }: Props) {
  const { runId, steps, runFailed, start } = useRecommendationStream()
  const startedFor = useRef<string | null>(null)

  useEffect(() => {
    if (startedFor.current === customerId) return
    startedFor.current = customerId
    start(customerId).catch((err) => {
      console.error('Failed to start recommendation run', err)
    })
  }, [customerId, start])

  return (
    <section className="orchestration-screen">
      <button className="back-btn" onClick={onBack}>
        &larr; New conversation
      </button>

      <OrchestratorCanvas runId={runId} steps={steps} />

      {runFailed && <p className="orchestration-screen__error">Run failed: {runFailed}</p>}
    </section>
  )
}

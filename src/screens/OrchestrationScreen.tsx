import { useEffect, useRef, useState } from 'react'
import { getCustomerProfile } from '../api/client'
import { LiveVsFinal } from '../components/orchestration/LiveVsFinal'
import type { CustomerProfile } from '../types'
import { OrchestratorCanvas } from '../components/orchestration/OrchestratorCanvas'
import { useRecommendationStream } from '../hooks/useRecommendationStream'

interface Props {
  customerId: string
  onBack: () => void
}

export function OrchestrationScreen({ customerId, onBack }: Props) {
  const { runId, steps, runFailed, start } = useRecommendationStream()
  const startedFor = useRef<string | null>(null)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)

  useEffect(() => {
    getCustomerProfile(customerId).then(setProfile).catch(() => setProfile(null))
  }, [customerId])

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

      <LiveVsFinal live={profile?.liveInsights ?? null} steps={steps} />

      <OrchestratorCanvas runId={runId} steps={steps} />

      {runFailed && <p className="orchestration-screen__error">Run failed: {runFailed}</p>}
    </section>
  )
}

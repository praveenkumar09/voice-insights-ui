import { useEffect, useRef, useState } from 'react'
import { getCustomerProfile } from '../api/client'
import { RunWorkspace } from '../components/workspace/RunWorkspace'
import type { CustomerProfile } from '../types'
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

      <RunWorkspace runId={runId} steps={steps} profile={profile} initialTab="agents" runFailed={runFailed} />
    </section>
  )
}

import { useState } from 'react'
import { saveCustomerProfile } from '../api/client'
import { CustomerProfileCard } from '../components/CustomerProfileCard'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { ComplianceWatch, NeedTags, NextQuestions, ProductMatches } from '../components/copilot/CopilotPanels'
import { SignalGauges } from '../components/copilot/SignalGauges'
import { VoiceOrb } from '../components/VoiceOrb'
import { useVoiceCapture } from '../hooks/useVoiceCapture'
import { printMeetingBrief } from '../utils/meetingBrief'

interface Props {
  onReady: (customerId: string) => void
}

export function CaptureScreen({ onReady }: Props) {
  const { status, amplitude, partialText, finalSegments, profile, copilot, signalHistory, errorMessage, start, stop } = useVoiceCapture()
  const [advancing, setAdvancing] = useState(false)

  const listening = status === 'listening' || status === 'connecting'
  const canRecommend = status === 'stopped' && !!profile?.id

  async function handleOrbClick() {
    if (listening) {
      stop()
      return
    }
    await start()
  }

  async function handleGetRecommendations() {
    if (!profile?.id) return
    setAdvancing(true)
    try {
      await saveCustomerProfile({ ...profile, status: 'FINALIZED' })
      onReady(profile.id)
    } finally {
      setAdvancing(false)
    }
  }

  const statusLabel: Record<typeof status, string> = {
    idle: 'Ready',
    connecting: 'Connecting',
    listening: 'Live',
    stopping: 'Finishing',
    stopped: 'Captured',
    error: 'Error',
  }

  return (
    <section className="capture-screen">
      <div className="capture-hero">
        <div>
          <h2 className="capture-hero__title">Customer Conversation Intelligence</h2>
          <p className="capture-hero__sub">
            Capture the conversation, let specialised agents analyse it, and walk into the next meeting equipped.
          </p>
        </div>
        <ol className="capture-steps">
          <li className={status === 'idle' || listening ? 'is-active' : 'is-done'}>
            <span>1</span>Capture
          </li>
          <li className={status === 'stopped' ? 'is-active' : ''}>
            <span>2</span>Analyse
          </li>
          <li>
            <span>3</span>Equip
          </li>
        </ol>
      </div>

      <div className="glass-card capture-console">
        <VoiceOrb listening={listening} amplitude={amplitude} onClick={handleOrbClick} disabled={status === 'stopping'} />
        <div className="capture-console__info">
          <span className={`capture-console__pill capture-console__pill--${status}`}>
            <span className="capture-console__dot" />
            {statusLabel[status]}
          </span>
          <p className="capture-screen__hint">
            {status === 'idle' && 'Select the microphone to begin capturing the customer conversation'}
            {status === 'connecting' && 'Connecting…'}
            {status === 'listening' && 'Listening — select the button again to stop'}
            {status === 'stopping' && 'Wrapping up…'}
            {status === 'stopped' && 'Session captured — ready for analysis'}
            {status === 'error' && (errorMessage ?? 'Something went wrong')}
          </p>
        </div>
        {status === 'stopped' && (
          <button className="ghost-btn" onClick={() => printMeetingBrief(profile, copilot)}>
            Download brief (PDF)
          </button>
        )}
        {canRecommend && (
          <button className="cta-btn" onClick={handleGetRecommendations} disabled={advancing}>
            {advancing ? 'Preparing…' : 'Get Recommendations'}
          </button>
        )}
      </div>

      <NextQuestions questions={copilot?.nextQuestions ?? []} />

      <div className="capture-grid">
        <div className="capture-grid__col">
          <TranscriptPanel partialText={partialText} finalSegments={finalSegments} isListening={status === 'listening'} />
          <ProductMatches matches={copilot?.productMatches ?? []} />
        </div>
        <div className="capture-grid__col">
          <SignalGauges copilot={copilot} history={signalHistory} />
          <NeedTags needs={copilot?.needs ?? []} />
          <ComplianceWatch flags={copilot?.complianceFlags ?? []} active={!!copilot} />
          <CustomerProfileCard profile={profile} />
        </div>
      </div>
    </section>
  )
}

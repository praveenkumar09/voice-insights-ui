import { nativeSentenceList, useEnabledLanguages } from '../utils/languages'
import { useState } from 'react'
import { saveCustomerProfile } from '../api/client'
import { RecentDebriefs } from '../components/home/RecentDebriefs'
import { JunoStage, JunoTranscript } from '../components/juno/JunoStage'
import { useJuno } from '../hooks/useJuno'
import { useJunoAction, useJunoScreen } from '../components/juno/mode/JunoMode'
import { DebriefReview } from '../components/review/DebriefReview'
import { CustomerProfileCard } from '../components/CustomerProfileCard'
import { LifeMap } from '../components/lifemap/LifeMap'
import { Constellation } from '../components/lifemap/Constellation'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { useVoiceCapture } from '../hooks/useVoiceCapture'
import { printMeetingBrief } from '../utils/meetingBrief'

interface Props {
  onReady: (customerId: string) => void
}

/** What happens after the advisor presses Start: the whole journey in three lines, shown until the first debrief begins. */
const steps = (languages: string) => [
  { title: 'Tell Spark about the meeting', text: `Speak the way you would brief a colleague. ${languages} all work, even mixed.` },
  { title: 'Spark checks for gaps', text: 'It asks a few short questions about anything missing or unclear, then reads back what it understood.' },
  { title: 'Review and approve', text: 'Confirm the facts, then get suggestions, a proposal and your advice pack.' },
]

/** The home screen: a debrief with Spark. The advisor dictates, Spark checks for gaps, then the advisor reviews and approves. */
export function CaptureScreen({ onReady }: Props) {
  useEnabledLanguages() // redraw when an admin changes the languages
  const voice = useVoiceCapture()
  const juno = useJuno(voice)
  const { status, amplitude, partialText, finalSegments, profile, copilot } = voice
  const [advancing, setAdvancing] = useState(false)

  const listening = status === 'listening' || status === 'connecting'
  const busy = listening || status === 'paused' || status === 'stopping' || (juno.stage !== 'idle' && juno.stage !== 'finished')
  const spoken = finalSegments.join(' ')
  // After a debrief the transcript, the facts to confirm and the follow-up become one sign-off document.
  const signOff = status === 'stopped' && juno.stage === 'finished'
  // Until the first debrief begins the page is just Spark and a short guide; the working panels appear once there is something to show.
  const started = busy || status !== 'idle' || juno.turns.length > 0
  const lifeMapNode = (
    <LifeMap customerName={profile?.customerName} lifeMap={copilot?.lifeMap} listening={listening} safe={false} debrief matches={copilot?.productMatches} />
  )

  useJunoScreen(signOff ? 'The debrief review page' : `The home screen, Debrief with Spark${busy ? ' (recording in progress)' : ''}`)
  useJunoAction(signOff ? { id: 'new_debrief', description: 'Start a new debrief', risk: 'change', run: () => { juno.reset(); return 'Ready for a new debrief.' } } : null)

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

  return (
    <section className="capture-screen">
      {!signOff && (
        <div className="capture-hero">
          <div>
            <h2 className="capture-hero__title">Debrief with Spark</h2>
            <p className="capture-hero__sub">
              Dictate what happened in your own words. Spark then checks for anything missing and asks a few short questions, so nothing is lost before you start the analysis.
            </p>
          </div>
        </div>
      )}

      {!signOff && (
        <JunoStage
          k={juno}
          amplitude={amplitude}
          partialText={partialText}
          profile={profile}
          copilot={copilot}
          transcript={spoken}
          noVoice={typeof speechSynthesis === 'undefined'}
        />
      )}

      {!signOff && !started && <RecentDebriefs />}

      {!signOff && !started && (
        <ol className="home-steps" aria-label="How it works">
          {steps(nativeSentenceList()).map((s, i) => (
            <li key={s.title} className="home-steps__item">
              <span className="home-steps__n" aria-hidden>{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {!signOff && started && <Constellation customerName={profile?.customerName} lifeMap={copilot?.lifeMap} live={listening || busy} />}

      {signOff && profile?.id && (
        <DebriefReview
          lifeMap={lifeMapNode}
          profile={profile}
          copilot={copilot}
          segments={finalSegments}
          turns={juno.turns}
          readiness={juno.readiness}
          elapsedMs={juno.elapsedMs}
          advancing={advancing}
          onApprove={() => void handleGetRecommendations()}
          onBrief={() => printMeetingBrief(profile, copilot)}
          onNewDebrief={juno.reset}
          onProfileSaved={voice.patchProfile}
          onSaveLifeMap={voice.saveLifeMapEdit}
          onSaveTranscript={voice.saveTranscriptEdit}
        />
      )}

      {!signOff && started && (
        <div className="capture-grid">
          <div className="capture-grid__col">
            {juno.turns.length > 0 && <JunoTranscript turns={juno.turns} />}
            <TranscriptPanel
              partialText={partialText}
              finalSegments={finalSegments}
              isListening={listening || status === 'stopping'}
              onSaveEdit={status === 'stopped' ? voice.saveTranscriptEdit : undefined}
            />
          </div>
          <div className="capture-grid__col">
            <CustomerProfileCard profile={profile} />
          </div>
        </div>
      )}
    </section>
  )
}

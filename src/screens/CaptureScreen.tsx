import { useEffect, useRef, useState } from 'react'
import { saveCustomerProfile } from '../api/client'
import { CoverageCues } from '../components/capture/CoverageCues'
import { LiveWaveform } from '../components/capture/LiveWaveform'
import { ModeSwitch, type HomeMode } from '../components/capture/ModeSwitch'
import { JunoStage, JunoTranscript } from '../components/juno/JunoStage'
import { useJuno } from '../hooks/useJuno'
import { ConfirmChips } from '../components/capture/ConfirmChips'
import { DebriefFollowUp } from '../components/capture/DebriefFollowUp'
import { ReviewPanel } from '../components/capture/ReviewPanel'
import { useElapsed } from '../components/capture/useElapsed'
import { CustomerProfileCard } from '../components/CustomerProfileCard'
import { ComplianceWatch, NeedTags, NextQuestions, ProductMatches } from '../components/copilot/CopilotPanels'
import { SignalGauges } from '../components/copilot/SignalGauges'
import { LifeMap } from '../components/lifemap/LifeMap'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { VoiceOrb } from '../components/VoiceOrb'
import { useVoiceCapture } from '../hooks/useVoiceCapture'
import { printMeetingBrief } from '../utils/meetingBrief'

interface Props {
  onReady: (customerId: string) => void
}

const MODE_KEY = 'vi_home_mode'

function storedMode(): HomeMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'live' || v === 'juno' ? v : 'debrief'
  } catch {
    return 'debrief'
  }
}

export function CaptureScreen({ onReady }: Props) {
  const voice = useVoiceCapture()
  const juno = useJuno(voice)
  const { status, amplitude, partialText, finalSegments, profile, copilot, signalHistory, errorMessage } = voice
  const [advancing, setAdvancing] = useState(false)
  const [mode, setMode] = useState<HomeMode>(storedMode)
  // Customer-safe view is deliberately never remembered: it is something the advisor turns on for a moment, and a
  // fresh page always starts with the advisor's full view. It only applies when the customer is in the room (live mode).
  const [safeView, setSafeView] = useState(false)
  const [take, setTake] = useState(1)
  const [session, setSession] = useState(0)
  const consoleRef = useRef<HTMLDivElement>(null)
  // The recommend button lives in the console at the top; once that scrolls away a docked copy keeps it in reach.
  const [consoleVisible, setConsoleVisible] = useState(true)

  const debrief = mode === 'debrief'
  const withJuno = mode === 'juno'
  const listening = status === 'listening' || status === 'connecting'
  const busy = listening || status === 'paused' || status === 'stopping' || (withJuno && juno.stage !== 'idle' && juno.stage !== 'finished')
  const elapsed = useElapsed(status === 'listening', debrief, session)
  const canRecommend = status === 'stopped' && !!profile?.id
  const safe = safeView && mode === 'live'
  const spoken = finalSegments.join(' ')

  useEffect(() => {
    const el = consoleRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setConsoleVisible(entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  function changeMode(next: HomeMode) {
    if (busy || next === mode) return
    voice.reset()
    juno.reset()
    setMode(next)
    setSafeView(false)
    setTake(1)
    setSession((s) => s + 1)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // Not remembering the choice is fine.
    }
  }

  async function begin() {
    setTake(1)
    setSession((s) => s + 1)
    await voice.start(mode === 'juno' ? 'juno-debrief' : mode)
  }

  /** Live: the button starts and stops. Debrief: it starts, then pauses and resumes between takes. */
  async function handleOrbClick() {
    if (!debrief) {
      if (listening) voice.stop()
      else await begin()
      return
    }
    if (status === 'listening') voice.pause()
    else if (status === 'paused') {
      setTake((t) => t + 1)
      await voice.resume()
    } else await begin()
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
    listening: debrief ? 'Dictating' : 'Live',
    paused: 'Paused',
    stopping: 'Finishing',
    stopped: debrief ? 'Ready to review' : 'Captured',
    error: 'Error',
  }

  const hint = debrief
    ? {
        idle: 'Press the microphone and tell it about the meeting — the way you would brief a colleague.',
        connecting: 'Getting ready — start speaking when this says Dictating…',
        listening: 'Dictating — speak naturally. Pause any time; you can dictate in several takes.',
        paused: 'Paused — resume when you are ready, or finish to review.',
        stopping: 'Wrapping up…',
        stopped: 'Dictation captured — check it below, then get recommendations.',
        error: errorMessage ?? 'Something went wrong',
      }[status]
    : {
        idle: 'Select the microphone to begin capturing the customer conversation',
        connecting: 'Getting ready — start speaking when this says Live…',
        listening: 'Listening — select the button again to stop',
        paused: '',
        stopping: 'Wrapping up…',
        stopped: 'Session captured — ready for analysis',
        error: errorMessage ?? 'Something went wrong',
      }[status]

  const recommendCta = canRecommend && (
    // After a debrief with Juno only a real press by a person counts: a scripted click is ignored.
    <button className="cta-btn" onClick={(e) => { if (withJuno && !e.isTrusted) return; void handleGetRecommendations() }} disabled={advancing}>
      {advancing ? 'Preparing…' : 'Get Recommendations'}
    </button>
  )

  return (
    <section className="capture-screen">
      <div className="capture-hero">
        <div>
          <h2 className="capture-hero__title">{debrief ? 'Debrief the meeting' : withJuno ? 'Debrief with Juno' : 'Customer Conversation Intelligence'}</h2>
          <p className="capture-hero__sub">
            {debrief
              ? 'Dictate what you learned once the customer has left. Juno turns your summary into recommendations, a report and a proposal.'
              : withJuno
                ? 'Dictate what happened in your own words. Juno then checks for anything missing and asks a few short questions, so nothing is lost before you start the analysis.'
                : 'Capture the conversation, let Juno and its specialist agents analyse it, and walk into the next meeting equipped.'}
          </p>
        </div>
        <div className="capture-hero__controls">
          <ModeSwitch mode={mode} onChange={changeMode} disabled={busy} />
          {mode === 'live' && (
            <div className={`safe-toggle${safeView ? ' is-on' : ''}`}>
              <button role="switch" aria-checked={safeView} onClick={() => setSafeView((v) => !v)}>
                <span className="safe-toggle__track"><span /></span>
                <span className="safe-toggle__text">
                  <strong>Customer-safe view</strong>
                  <small>{safeView ? 'On — internal signals and product details are hidden' : 'Turn on to show this screen to the customer'}</small>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {withJuno && (
        <JunoStage
          k={juno}
          amplitude={amplitude}
          partialText={partialText}
          profile={profile}
          copilot={copilot}
          canRecommend={canRecommend}
          advancing={advancing}
          onRecommend={handleGetRecommendations}
          onBrief={() => printMeetingBrief(profile, copilot)}
          noVoice={typeof speechSynthesis === 'undefined'}
          safe={safe}
        />
      )}

      {!withJuno && <div ref={consoleRef} className={`glass-card capture-console${status === 'listening' ? ' is-live' : ''}`}>
        <VoiceOrb
          listening={status === 'listening' || status === 'connecting'}
          amplitude={amplitude}
          onClick={handleOrbClick}
          disabled={status === 'stopping' || status === 'connecting'}
          activeAction={debrief ? 'pause' : 'stop'}
        />
        <div className="capture-console__info">
          <div className="capture-console__row">
            <span className={`capture-console__pill capture-console__pill--${status}`}>
              <span className="capture-console__dot" />
              {statusLabel[status]}
            </span>
            {(status === 'listening' || status === 'paused' || status === 'stopped' || status === 'stopping') && (
              <span className="capture-console__timer">{elapsed}</span>
            )}
            {debrief && (status === 'listening' || status === 'paused') && <span className="capture-console__take">Take {take}</span>}
          </div>
          <p className="capture-screen__hint">{hint}</p>
          <div className="noise-filter" role="group" aria-label="Background audio filter">
            <span className="noise-filter__label">Background filter</span>
            <div className="noise-filter__seg">
              {(['off', 'normal', 'strong'] as const).map((f) => (
                <button key={f} className={voice.noiseFilter === f ? 'is-active' : ''} aria-pressed={voice.noiseFilter === f} onClick={() => voice.setNoiseFilter(f)}>
                  {f === 'off' ? 'Off' : f === 'normal' ? 'Normal' : 'Strong'}
                </button>
              ))}
            </div>
            {voice.backgroundIgnored && listening && <span className="noise-filter__live">Ignoring background audio</span>}
          </div>
        </div>
        <LiveWaveform amplitude={amplitude} active={status === 'listening'} />

        {debrief && status === 'paused' && (
          <button className="ghost-btn" onClick={handleOrbClick}>Resume</button>
        )}
        {debrief && (status === 'listening' || status === 'paused') && (
          <button className="cta-btn" onClick={() => voice.stop()}>Finish &amp; review</button>
        )}
        {!safe && status === 'stopped' && (
          <button className="ghost-btn" onClick={() => printMeetingBrief(profile, copilot)}>Download brief (PDF)</button>
        )}
        {!safe && recommendCta}
      </div>}

      {safe && (
        <div className="safe-banner">
          Customer-safe view is on — only the conversation and the customer’s own words are shown.
          <button onClick={() => setSafeView(false)}>Show everything</button>
        </div>
      )}

      {mode === 'live' && !safe && <NextQuestions questions={copilot?.nextQuestions ?? []} context={copilot?.askContext} />}

      <LifeMap
        customerName={profile?.customerName}
        lifeMap={copilot?.lifeMap}
        listening={status === 'listening' || status === 'connecting'}
        safe={safe}
        debrief={debrief || withJuno}
        matches={copilot?.productMatches}
      />

      <div className={safe ? 'capture-safe' : 'capture-grid'}>
        <div className="capture-grid__col">
          {withJuno && juno.turns.length > 0 && <JunoTranscript turns={juno.turns} />}
          <TranscriptPanel
            partialText={partialText}
            finalSegments={finalSegments}
            isListening={status === 'listening' || status === 'connecting' || status === 'stopping'}
            onSaveEdit={status === 'stopped' ? voice.saveTranscriptEdit : undefined}
          />
          {mode === 'live' && !safe && <ProductMatches matches={copilot?.productMatches ?? []} />}
        </div>
        {!safe && (
          <div className="capture-grid__col">
            {debrief || withJuno ? (
              <>
                <CoverageCues profile={profile} copilot={copilot} text={spoken} />
                <CustomerProfileCard profile={profile} />
              </>
            ) : (
              <>
                <SignalGauges copilot={copilot} history={signalHistory} />
                <NeedTags needs={copilot?.needs ?? []} />
                <ComplianceWatch flags={copilot?.complianceFlags ?? []} active={!!copilot} />
                <CustomerProfileCard profile={profile} />
              </>
            )}
          </div>
        )}
      </div>

      {(debrief || withJuno) && status === 'stopped' && profile?.id && (
        <>
          {withJuno && <ConfirmChips profile={profile} onSaved={voice.patchProfile} />}
          {withJuno && <DebriefFollowUp key={profile.id} profileId={profile.id} customerName={profile.customerName ?? ''} />}
          <ReviewPanel
            profile={profile}
            copilot={copilot}
            onProfileSaved={voice.patchProfile}
            onSaveLifeMap={voice.saveLifeMapEdit}
          />
        </>
      )}

      {!safe && canRecommend && !consoleVisible && (
        <div className="recommend-dock" role="region" aria-label="Next step">
          <span>
            <strong>Captured and ready.</strong> Get the detailed recommendations, report and proposal.
          </span>
          {recommendCta}
        </div>
      )}
    </section>
  )
}

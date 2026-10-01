import type { CSSProperties } from 'react'
import { MicIcon, PauseIcon, StopIcon } from './icons'

interface Props {
  listening: boolean
  amplitude: number
  onClick: () => void
  disabled?: boolean
  /** What the button does while active: stop the recording (live) or pause it (debrief). */
  activeAction?: 'stop' | 'pause'
}

export function VoiceOrb({ listening, amplitude, onClick, disabled, activeAction = 'stop' }: Props) {
  const style = { '--amp': Math.min(1, amplitude) } as CSSProperties

  return (
    <button
      className={`voice-orb ${listening ? 'is-listening' : ''}`}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? (activeAction === 'pause' ? 'Pause dictation' : 'Stop recording') : 'Start recording'}
    >
      <span className="voice-orb__ring voice-orb__ring--1" />
      <span className="voice-orb__ring voice-orb__ring--2" />
      <span className="voice-orb__ring voice-orb__ring--3" />
      <span className="voice-orb__core">{listening ? (activeAction === 'pause' ? <PauseIcon /> : <StopIcon />) : <MicIcon />}</span>
    </button>
  )
}

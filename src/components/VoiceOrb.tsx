import type { CSSProperties } from 'react'
import { MicIcon, StopIcon } from './icons'

interface Props {
  listening: boolean
  amplitude: number
  onClick: () => void
  disabled?: boolean
}

export function VoiceOrb({ listening, amplitude, onClick, disabled }: Props) {
  const style = { '--amp': Math.min(1, amplitude) } as CSSProperties

  return (
    <button
      className={`voice-orb ${listening ? 'is-listening' : ''}`}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? 'Stop recording' : 'Start recording'}
    >
      <span className="voice-orb__ring voice-orb__ring--1" />
      <span className="voice-orb__ring voice-orb__ring--2" />
      <span className="voice-orb__ring voice-orb__ring--3" />
      <span className="voice-orb__core">{listening ? <StopIcon /> : <MicIcon />}</span>
    </button>
  )
}

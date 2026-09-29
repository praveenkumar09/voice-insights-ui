import { useEffect, useRef } from 'react'

interface Props {
  partialText: string
  finalSegments: string[]
  isListening: boolean
}

export function TranscriptPanel({ partialText, finalSegments, isListening }: Props) {
  const isEmpty = finalSegments.length === 0 && !partialText
  const bodyRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest text — without this, a long conversation just
  // keeps appending above the visible area and looks "stopped" even though
  // it's still capturing everything.
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [partialText, finalSegments])

  const wordCount = finalSegments.join(' ').trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="glass-card transcript-panel">
      <div className="transcript-panel__header">
        <span className="glass-card__label transcript-panel__label">Live Transcript</span>
        {isListening && (
          <span className="transcript-panel__status">
            <span className="transcript-panel__status-dot" />
            Capturing audio
          </span>
        )}
      </div>

      <div className="transcript-panel__body" ref={bodyRef}>
        {isEmpty && <p className="transcript-panel__empty">Transcript will appear here as you speak with the customer.</p>}
        {finalSegments.map((seg, i) => (
          <p className="transcript-panel__segment" key={i}>
            {seg}
          </p>
        ))}
        {partialText && <p className="transcript-panel__segment transcript-panel__segment--partial">{partialText}</p>}
      </div>

      {!isEmpty && (
        <div className="transcript-panel__footer">
          {wordCount} word{wordCount === 1 ? '' : 's'} transcribed
        </div>
      )}
    </div>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { countWords } from '../utils/wordCount'

interface Props {
  partialText: string
  finalSegments: string[]
  isListening: boolean
  /** When provided, the transcript can be corrected; resolves once the server has re-analysed it. */
  onSaveEdit?: (text: string) => Promise<void>
}

export function TranscriptPanel({ partialText, finalSegments, isListening, onSaveEdit }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isEmpty = finalSegments.length === 0 && !partialText
  const bodyRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest text — without this, a long conversation just
  // keeps appending above the visible area and looks "stopped" even though
  // it's still capturing everything.
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [partialText, finalSegments])

  const wordCount = countWords(finalSegments.join(' '))
  const lastIndex = finalSegments.length - 1
  const canEdit = !!onSaveEdit && !isListening && finalSegments.length > 0

  function startEdit() {
    setDraft(finalSegments.join('\n\n'))
    setSaveError(null)
    setEditing(true)
  }

  async function save() {
    if (!onSaveEdit) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSaveEdit(draft)
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the transcript')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`glass-card transcript-panel${isListening ? ' is-live' : ''}`}>
      <div className="transcript-panel__header">
        <span className="glass-card__label transcript-panel__label">Live Transcript</span>
        {isListening && (
          <span className="transcript-panel__status">
            <span className="transcript-panel__status-dot" />
            Capturing audio
          </span>
        )}
        {canEdit && !editing && (
          <button className="transcript-panel__edit-btn" onClick={startEdit}>
            ✎ Edit transcript
          </button>
        )}
      </div>

      {editing ? (
        <div className="transcript-edit">
          <textarea
            className="transcript-edit__area"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            autoFocus
            spellCheck
          />
          <p className="transcript-edit__hint">
            Fix any mis-heard words. Saving re-analyses the conversation — profile, signals and product matches update, and
            the corrected text is what the suggestion agents use.
          </p>
          {saveError && <p className="transcript-edit__error">{saveError}</p>}
          <div className="transcript-edit__actions">
            <button className="ghost-btn" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button className="cta-btn transcript-edit__save" onClick={save} disabled={saving || !draft.trim()}>
              {saving ? 'Re-analysing…' : 'Save & update'}
            </button>
          </div>
        </div>
      ) : (
      <div className="transcript-panel__body" ref={bodyRef}>
        {isEmpty && (
          <p className="transcript-panel__empty">
            {isListening ? 'Listening… start speaking and the words will appear here instantly.' : 'Transcript will appear here as you speak with the customer.'}
          </p>
        )}
        <AnimatePresence initial={false}>
          {finalSegments.map((seg, i) => (
            <motion.p
              className={`transcript-panel__segment${i === lastIndex && !partialText ? ' is-latest' : ''}`}
              key={i}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              {seg}
            </motion.p>
          ))}
        </AnimatePresence>
        {partialText && (
          <p className="transcript-panel__segment transcript-panel__segment--partial">
            {partialText}
            <span className="transcript-panel__caret" />
          </p>
        )}
      </div>
      )}

      {!isEmpty && !editing && (
        <div className="transcript-panel__footer">
          {wordCount} word{wordCount === 1 ? '' : 's'} transcribed
        </div>
      )}
    </div>
  )
}

export type HomeMode = 'debrief' | 'live' | 'juno'

interface Props {
  mode: HomeMode
  onChange: (m: HomeMode) => void
  disabled?: boolean
}

/** How this conversation is being captured: dictated after the meeting (the usual way) or live with the customer. */
export function ModeSwitch({ mode, onChange, disabled }: Props) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Capture mode">
      <button role="tab" aria-selected={mode === 'debrief'} className={mode === 'debrief' ? 'is-active' : ''} onClick={() => onChange('debrief')} disabled={disabled}>
        <strong>After the meeting</strong>
        <small>Dictate your summary</small>
      </button>
      <button role="tab" aria-selected={mode === 'live'} className={mode === 'live' ? 'is-active' : ''} onClick={() => onChange('live')} disabled={disabled}>
        <strong>With the customer</strong>
        <small>Live conversation</small>
      </button>
      <button role="tab" aria-selected={mode === 'juno'} className={`mode-switch__juno${mode === 'juno' ? ' is-active' : ''}`} onClick={() => onChange('juno')} disabled={disabled}>
        <strong>Juno <i>AI host</i></strong>
        <small>Juno talks with the customer</small>
      </button>
    </div>
  )
}

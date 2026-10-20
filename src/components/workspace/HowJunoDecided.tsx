import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AgentState } from '../../hooks/useRecommendationStream'
import type { AgentKey, CustomerProfile } from '../../types'
import { AGENT_NAME } from '../../brand'
import { LiveVsFinal } from '../orchestration/LiveVsFinal'
import { OrchestratorCanvas } from '../orchestration/OrchestratorCanvas'
import { useJunoAction } from '../juno/mode/JunoMode'

export type HowView = 'agents' | 'live'

interface ContentProps {
  runId: string | null
  steps: Record<AgentKey, AgentState>
  profile: CustomerProfile | null
  hasLive: boolean
  finalReady: boolean
  view: HowView
  onView: (v: HowView) => void
}

/**
 * How the suggestion was reached: every agent as a card that opens to what it went through (the same cards as while the analysis runs),
 * and, after a live conversation, what the copilot thought then against what the agents concluded.
 */
export function HowJunoDecidedContent({ runId, steps, profile, hasLive, finalReady, view, onView }: ContentProps) {
  const live = profile?.liveInsights ?? null
  return (
    <div className="hjd">
      <div className="ws__seg ws__seg--docs" role="tablist" aria-label={`How ${AGENT_NAME} decided`}>
        <button role="tab" aria-selected={view === 'agents'} className={view === 'agents' ? 'is-active' : ''} onClick={() => onView('agents')}>The agents</button>
        {hasLive && <button role="tab" aria-selected={view === 'live'} className={view === 'live' ? 'is-active' : ''} onClick={() => onView('live')}>Live vs final</button>}
      </div>
      {view === 'agents' && (
        <>
          <p className="hjd__hint">Open any agent to see what it looked at and what it concluded.</p>
          <OrchestratorCanvas runId={runId} steps={steps} />
        </>
      )}
      {view === 'live' && hasLive && (finalReady
        ? <LiveVsFinal live={live!} steps={steps} showBuying={profile?.captureMode !== 'DEBRIEF' && profile?.captureMode !== 'JUNO_DEBRIEF'} />
        : <div className="glass-card ws__waiting"><span className="proposal__spinner" /><div><strong>Waiting for the agents’ final analysis</strong><p>The comparison appears as soon as the need and product agents finish.</p></div></div>)}
    </div>
  )
}

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/** A side panel that slides in over the page. Esc, the × and a click outside close it; its contents stay mounted once opened. */
export function HowJunoDecidedDrawer({ open, onClose, children }: DrawerProps) {
  const [everOpened, setEverOpened] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    setEverOpened(true)
    returnTo.current = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => closeRef.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      returnTo.current?.focus?.()
    }
  }, [open, onClose])

  // "Hey Juno, close this" while it is open.
  useJunoAction(open ? { id: 'close_panel', description: `Close the ${AGENT_NAME} side panel`, risk: 'open', run: () => { onClose() } } : null)

  // Portalled to <body>: the page's entrance animation would otherwise become the containing block of this fixed panel.
  return createPortal(
    <div className={`hjd-root${open ? ' is-open' : ''}`}>
      <div className="hjd-scrim" onClick={onClose} aria-hidden />
      <aside className="hjd-drawer" role="dialog" aria-modal="true" aria-label={`How ${AGENT_NAME} decided`} aria-hidden={!open}>
        <header className="hjd-drawer__head">
          <div>
            <h3>How {AGENT_NAME} decided</h3>
            <p>For the advisor. What each agent looked at and concluded.</p>
          </div>
          <button ref={closeRef} type="button" className="hjd-x" onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1}>×</button>
        </header>
        <div className="hjd-drawer__body">{everOpened ? children : null}</div>
      </aside>
    </div>,
    document.body,
  )
}

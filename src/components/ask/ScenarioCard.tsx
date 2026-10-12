import type { WhatIfChange, WhatIfProduct, WhatIfView } from '../../api/client'
import { changeText } from '../../utils/whatIf'

const STEPS = ['need', 'risk', 'affordability', 'merge', 'persona', 'productScoring', 'productShortlist', 'ragValidation', 'complianceCheck']
const STEP_LABEL: Record<string, string> = {
  need: 'Needs', risk: 'Risk', affordability: 'Affordability', merge: 'Putting it together', persona: 'Customer type',
  productScoring: 'Weighing products', productShortlist: 'Shortlisting', ragValidation: 'Checking the documents', complianceCheck: 'Compliance',
}

const MOVE: Record<WhatIfProduct['movement'], { icon: string; text: string }> = {
  UP: { icon: '▲', text: 'Moves up' },
  DOWN: { icon: '▼', text: 'Moves down' },
  NEW: { icon: '＋', text: 'Comes in' },
  DROPPED: { icon: '−', text: 'Drops out' },
  SAME: { icon: '＝', text: 'Same place' },
}

interface Props {
  stage: 'proposed' | 'running' | 'done' | 'failed'
  changes: WhatIfChange[]
  view: WhatIfView | null
  onRun: () => void
  onDrop: () => void
}

/** A "what if" on the screen: what would be different, then (once run) the original suggestions beside the new ones. */
export function ScenarioCard({ stage, changes, view, onRun, onDrop }: Props) {
  const done = view?.progress.filter((p) => STEPS.includes(p.agent) && p.status === 'COMPLETED').length ?? 0
  const finished = new Set(view?.progress.filter((p) => p.status === 'COMPLETED').map((p) => p.agent))
  const current = STEPS.find((a) => !finished.has(a) && (a === 'need' || a === 'risk' || a === 'affordability' ? true : STEPS.slice(0, STEPS.indexOf(a)).every((b) => finished.has(b) || ['need', 'risk', 'affordability'].includes(b))))
  const result = view?.result ?? null
  return (
    <div className={`wi wi--${stage}`} role="group" aria-label="What if scenario">
      <div className="wi__head">
        <span className="wi__tag">What if</span>
        <span className="wi__note">An explored scenario, not {`the customer’s`} actual situation</span>
      </div>

      <ul className="wi__changes">
        {changes.map((c, i) => (
          <li key={i}><b>{c.label}</b><span>{changeText(c)}</span></li>
        ))}
      </ul>

      {stage === 'proposed' && (
        <div className="wi__actions">
          <button className="wi__run" onClick={onRun}>Run it</button>
          <button className="wi__ghost" onClick={onDrop}>Not now</button>
          <span className="wi__hint">or just say “yes”</span>
        </div>
      )}

      {stage === 'running' && (
        <div className="wi__progress" aria-live="polite">
          <div className="wi__bar"><i style={{ width: `${Math.max(6, (done / STEPS.length) * 100)}%` }} /></div>
          <span>{current ? `${STEP_LABEL[current] ?? 'Working'}…` : 'Starting the analysis…'} {done} of {STEPS.length}</span>
        </div>
      )}

      {stage === 'failed' && <p className="wi__fail">The analysis didn’t finish. Nothing has changed — ask me again.</p>}

      {stage === 'done' && result && (
        <>
          <p className="wi__summary">{result.summary}</p>
          <div className="wi__table" role="table" aria-label="Original suggestions compared with the scenario">
            <div className="wi__row wi__row--head" role="row">
              <span role="columnheader">Product</span>
              <span role="columnheader">Original</span>
              <span role="columnheader">With the change</span>
            </div>
            {result.products.map((p) => (
              <div key={p.name} className={`wi__row wi__row--${p.movement.toLowerCase()}`} role="row">
                <span className="wi__name" role="cell">
                  {p.name}
                  <em className={`wi__move wi__move--${p.movement.toLowerCase()}`}><i aria-hidden>{MOVE[p.movement].icon}</i> {MOVE[p.movement].text}</em>
                </span>
                <span role="cell">{p.before ? <><b>#{p.before}</b> {p.relevanceBefore ?? ''}</> : <span className="wi__none">Not shortlisted</span>}</span>
                <span role="cell">{p.after ? <><b>#{p.after}</b> {p.relevanceAfter ?? ''}</> : <span className="wi__none">Not shortlisted</span>}</span>
                {p.why && <p className="wi__why">{p.why}</p>}
              </div>
            ))}
          </div>
          {result.complianceBefore !== result.complianceAfter && result.complianceBefore != null && result.complianceAfter != null && (
            <p className="wi__comp">Compliance review: {result.complianceBefore ? 'cleared' : 'needs review'} originally, {result.complianceAfter ? 'cleared' : 'needs review'} with this change.</p>
          )}
          <p className="wi__foot">The original suggestions are unchanged and this is saved with the discussion. If this is really true of the customer, add it to their profile and run the analysis again.</p>
        </>
      )}
    </div>
  )
}

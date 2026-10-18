import { useState } from 'react'
import type { ReadDoc } from '../../../api/client'
import { useLastRun } from '../../../utils/lastRun'
import { useJunoAction, useJunoMode } from './JunoMode'

const PACK_DOCS: Record<string, ReadDoc> = {
  fact_find: 'fact-find', record_of_advice: 'record-of-advice', follow_up: 'follow-up', crm_note: 'crm', next_meeting: 'next-meeting', whole_pack: 'pack',
}

/**
 * What Juno can read aloud, from anywhere in the app, for the suggestion the advisor last looked at: "Hey Juno, brief me" (a 90-second
 * summary, the default), "read the full report", or a part of the advice pack. Reading only reads; it changes nothing.
 */
export function ReadAloudActions({ enabled }: { enabled: boolean }) {
  const j = useJunoMode()
  const last = useLastRun()
  const on = enabled && !!last
  const who = last?.name ?? 'the customer'
  const go = async (doc: ReadDoc, what: string) => {
    try { await j.read(last!.runId, doc, last!.name) } catch (e) { return e instanceof Error ? e.message : `I couldn’t read ${what} just now.` }
  }
  useJunoAction(on ? { id: 'brief_me', description: `Brief me: a short spoken summary of ${who}’s case`, risk: 'open', run: () => go('brief', 'the briefing') } : null)
  useJunoAction(on ? { id: 'read_report', description: `Read the full advisory report for ${who}`, risk: 'open', run: () => go('report', 'the report') } : null)
  useJunoAction(on ? {
    id: 'read_pack', description: 'Read part of the advice pack aloud: Fact-find, Record of advice, Follow-up message, CRM note, Next meeting, or the whole pack', risk: 'open',
    params: { part: { type: 'enum', values: Object.keys(PACK_DOCS) } },
    run: (p) => go(PACK_DOCS[p.part] ?? 'pack', 'the pack'),
  } : null)
  return null
}

/** "Brief me" and "Read the report" for the workspace hero, for the advisor who would rather tap than talk. */
export function ReadAloudButtons({ runId, name }: { runId: string; name?: string | null }) {
  const j = useJunoMode()
  const [busy, setBusy] = useState<ReadDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const start = async (doc: ReadDoc) => {
    setBusy(doc)
    setError(null)
    try { await j.read(runId, doc, name ?? undefined) } catch (e) { setError(e instanceof Error ? e.message : 'Could not start reading.') } finally { setBusy(null) }
  }
  const playing = !!j.reading
  return (
    <div className="hero__read">
      <button type="button" className="hero__read-btn hero__read-btn--main" onClick={() => start('brief')} disabled={!!busy || playing}>
        <span aria-hidden>▶</span>{busy === 'brief' ? 'Preparing…' : 'Brief me'}
      </button>
      <button type="button" className="hero__read-btn" onClick={() => start('report')} disabled={!!busy || playing}>
        {busy === 'report' ? 'Preparing…' : 'Read the report'}
      </button>
      {error && <span className="hero__read-err" role="alert">{error}</span>}
    </div>
  )
}

import { useState } from 'react'
import { getMemoryBrief, getMemoryBriefFor, type ReadDoc } from '../../../api/client'
import { parseChoice } from '../../../utils/junoWords'
import { useLastRun } from '../../../utils/lastRun'
import { useJunoAction, useJunoMode } from './JunoMode'

const PACK_DOCS: Record<string, ReadDoc> = {
  fact_find: 'fact-find', record_of_advice: 'record-of-advice', follow_up: 'follow-up', crm_note: 'crm', next_meeting: 'next-meeting', whole_pack: 'pack',
}

/**
 * What Spark can read aloud, from anywhere in the app, for the suggestion the advisor last looked at: "Hey Spark, brief me" (a 90-second
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
  /** "Brief me on Nick": the latest debrief of that customer, from memory. If several people fit, Spark asks which; it never guesses. */
  const briefCustomer = async (name: string) => {
    let r = await getMemoryBrief(name)
    if (r.status === 'none') return r.say ?? `I don’t have a debrief for ${name}.`
    if (r.status === 'choose') {
      const cs = r.candidates
      const names = cs.map((c) => c.name)
      const labels = cs.map((c) => [c.name, c.occupation ?? (c.age ? String(c.age) : '')].filter(Boolean).join(' · '))
      const nameList = names.length === 2 ? `${names[0]}, or ${names[1]}` : `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`
      const sameFirst = new Set(names.map((n) => n.trim().split(/\s+/)[0].toLowerCase())).size === 1
      // While Spark asks, fetch each person's briefing in the background, so the answer starts playing at once.
      const ready = cs.map((c) => getMemoryBriefFor(c.id).catch(() => null))
      let pick: number | null = null
      for (let attempt = 0; attempt < 2 && pick === null; attempt++) {
        const q = attempt === 0
          ? `I have ${names.length === 2 ? 'two' : names.length} people ${sameFirst ? `called ${names[0].trim().split(/\s+/)[0]}` : `who fit ${name}`}: ${nameList}. Which one?`
          : `Sorry, which one? Say a name, or a number from one to ${cs.length}.`
        const heard = await j.ask(q, labels)
        if (!heard) continue
        pick = parseChoice(heard, names)
        console.debug('[juno] choice', JSON.stringify(heard), '->', pick)
        if (pick === -1) return 'Okay, I won’t brief you.'
      }
      if (pick === null) return 'I didn’t catch which one, so I haven’t briefed you. Ask again with their full name.'
      r = (await ready[pick]) ?? (await getMemoryBriefFor(cs[pick].id))
    }
    if (r.status !== 'found' || !r.reading) return 'I couldn’t put a brief together for that.'
    await j.readLoaded(r.reading)
  }
  useJunoAction(enabled ? {
    id: 'brief_customer', description: 'Brief me on a customer by name, from their latest debrief, for example "brief me on Nick"', risk: 'open',
    params: { name: { type: 'string' } },
    run: (p) => briefCustomer(p.name),
  } : null)
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

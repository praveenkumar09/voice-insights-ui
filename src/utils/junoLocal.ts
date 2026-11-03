import type { JunoActionSpec } from '../api/client'

/**
 * What can be said right now, and recognising the plain ones without asking the model.
 *
 * Most spoken requests are plain ("open follow-up", "switch to debrief with Spark", "go home"). Sending those to the language model costs
 * two to four seconds for nothing, so a request that is clearly one listed action, with nothing left over, is matched here. Anything
 * odd (a question, a negative, two possible actions, words we do not know) goes to the model as before.
 */

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const FILLER = new Set(('please can could you would will i want like need to go open show me switch change take bring the a an tab screen mode page now ' +
  'just view on in into set it lets let see hey ok okay thanks thank juno spark for of and then up back there that this my click press tap hit push select choose button').split(' '))

const NEGATIVE = /\b(no|not|dont|do not|never|cancel|stop|undo|without|instead)\b/

/** One-word choices that speech noise produces from other words, so they only count when the request also says what they are for. */
const AMBIGUOUS_ALONE = new Set(['dark', 'light'])

const display = (v: string) => norm(v.replace(/_/g, ' '))

/** Short phrases for the speech model's prompt: the screen's actions (short ones as written) and every value of their choices. */
export function vocabularyFor(actions: JunoActionSpec[], names: string[] = []): string[] {
  const out: string[] = []
  const add = (t: string) => { const x = t.replace(/\s+/g, ' ').trim(); if (x && x.length <= 70 && !out.includes(x)) out.push(x) }
  // One short phrase of recent customers' first names, right after the action that uses them: the server keeps the start of this list and
  // trims the end, so a name added last would never be heard.
  const shown: string[] = []
  for (const n of names) { if (`Brief me on ${[...shown, n].join(', ')}`.length <= 64) shown.push(n) }
  for (const a of actions) {
    const d = a.description.split(/[:.]/)[0]
    add(d.length <= 50 ? d : d.split(/ or |, /)[0])
    if (a.id === 'brief_customer' && shown.length > 0) add(`Brief me on ${shown.join(', ')}`)
    for (const p of Object.values(a.params ?? {})) for (const v of p.values ?? []) add(v.replace(/_/g, ' '))
  }
  for (const w of ['pause', 'resume', 'next', 'previous', 'repeat', 'stop']) add(w)
  return out
}

export interface LocalMatch { action: JunoActionSpec; params: Record<string, string> }

/** The single listed action that a plain request clearly means, or null when the model should decide. */
export function matchLocal(utterance: string, actions: JunoActionSpec[]): LocalMatch | null {
  const u = norm(utterance)
  const byName = matchBriefByName(u, actions)
  if (byName) return byName
  if (!u || u.split(' ').length > 8 || NEGATIVE.test(u)) return null
  const exact: LocalMatch[] = [] // a listed choice was named in full ("follow-up", "debrief with Spark")
  const loose: LocalMatch[] = [] // every word of the request appears in an action's description

  for (const a of actions) {
    if (a.risk === 'change') continue // anything that changes data is always confirmed through the model's wording
    const params = Object.entries(a.params ?? {})
    if (params.length === 0) {
      const have = new Set(norm(a.description).split(' '))
      const words = u.split(' ').filter((w) => !FILLER.has(w))
      if (words.length > 0 && words.every((w) => have.has(w))) loose.push({ action: a, params: {} })
    } else if (params.length === 1 && params[0][1].type === 'enum') {
      const [name, spec] = params[0]
      const hits = (spec.values ?? []).filter((v) => new RegExp(`(^| )${display(v)}( |$)`).test(u))
      if (hits.length === 0) continue
      // "dark" or "light" on their own are what faint or noisy speech turns "stop" and "right" into: the theme changes only when it is asked for as a mode.
      if (hits.every((v) => AMBIGUOUS_ALONE.has(display(v))) && !/(^| )(mode|theme|switch|change|turn)( |$)/.test(u)) continue
      const best = hits.sort((x, y) => display(y).length - display(x).length)[0] // "after the meeting" beats a shorter value inside it
      const rest = u.replace(display(best), ' ').split(' ').filter((w) => w && !FILLER.has(w))
      if (rest.length === 0) exact.push({ action: a, params: { [name]: best } })
    }
  }
  // A screen's own action (open_tab, switch_mode…) outranks the generic "press a button" one when both name the same thing.
  const own = exact.filter((m) => !m.action.id.startsWith('press_button'))
  if (own.length > 0) return own.length === 1 ? own[0] : null
  if (exact.length > 0) return exact.length === 1 ? exact[0] : null // naming a choice outranks a loose word match
  return loose.length === 1 ? loose[0] : null
}

/** "Brief me on Nick", "tell me about Priya": a named customer. "Brief me on this customer" is about the one on screen, so it is left to the model. */
const BRIEF_NAME = /^(?:please )?(?:(?:can|could|will|would) you )?(?:(?:(?:brief|debrief|update|remind) me|(?:tell|give) me (?:a )?(?:brief(?:ing)?|update)) (?:on|about|for|of)|(?:brief|debrief) (?:on|about|for|of)|tell me about|what do i know about) (.{2,60}?)(?: please| now)?$/
const NOT_A_NAME = /^(?:this|that|the current|the last|my last|him|her|them|it)(?: (?:customer|client|one|case|person))?$/

function matchBriefByName(u: string, actions: JunoActionSpec[]): LocalMatch | null {
  const action = actions.find((a) => a.id === 'brief_customer')
  if (!action) return null
  const m = BRIEF_NAME.exec(u)
  if (!m || NOT_A_NAME.test(m[1])) return null
  return { action, params: { name: m[1].trim().replace(/(^| )(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase()) } }
}

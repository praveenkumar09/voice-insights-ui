/**
 * Hearing "Hey Juno". The speech model often renders the name as something else ("you know", "Juneau", "junior"), so the greeting
 * ("hey", "ok", "hi") plus any of those counts, while a bare "Juno" only counts at the very start of what was said. A bare "junior" or
 * "you know" never wakes it: people say those all day.
 */
const NAME = '(?:juno|juneau|junior|jeno|jonno|yuno|gino|geno|chuno|june o|you know|jew no|ju no|ju now|jew now|june oh|june now|jo no|joe no|you no|yo no|juneo|junno)'
const GREETED = new RegExp(`\\b(?:hey|hi|ok|okay|hello|hay|hei|eh|ay|a)\\b[\\s,.!-]*${NAME}\\b[\\s,.!?:;-]*`, 'i')
const BARE = /^\W*(?:juno|juneau)\b[\s,.!?:;-]*/i

export interface Wake {
  /** What was said after the wake words (may be empty: "Hey Juno." on its own). */
  rest: string
}

export function parseWake(text: string): Wake | null {
  const m = GREETED.exec(text)
  if (m) return { rest: text.slice(m.index + m[0].length).trim() }
  const b = BARE.exec(text)
  if (b) return { rest: text.slice(b[0].length).trim() }
  return null
}

/** Leading wake words on a command that already follows a wake ("Juno, open follow-up") are dropped. */
export function stripWake(text: string): string {
  return parseWake(text)?.rest ?? text.trim()
}

const NO = /\b(no|nope|nah|cancel|don'?t|do not|stop|never ?mind|leave it|not now|wait)\b/i
const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|confirm|correct|that'?s right|go on|affirmative)\b/i

/** A spoken answer to "Shall I?": yes, no, or null when it was neither. "No" wins over "yes" ("no, don't"). */
export function parseYesNo(text: string): 'yes' | 'no' | null {
  if (NO.test(text)) return 'no'
  if (YES.test(text)) return 'yes'
  return null
}

/** What the advisor can say while Juno is reading aloud. Only short, plain commands count, so a stray sentence never changes the reading. */
export type ReadControl = 'pause' | 'resume' | 'next' | 'previous' | 'repeat' | 'stop'

const CONTROLS: [ReadControl, RegExp][] = [
  ['pause', /^(?:please )?(?:pause|hold on|hang on|wait)\b/i],
  ['resume', /^(?:please )?(?:resume|continue|go on|carry on|keep going|play)\b/i],
  ['next', /^(?:next(?: section| part)?|skip(?: this| that| ahead| it)?|move on)\b/i],
  ['previous', /^(?:back|previous(?: section| part)?|go back|last section)\b/i],
  ['repeat', /^(?:repeat(?: that| it| this)?|say that again|again)\b/i],
  ['stop', /^(?:stop|that'?s enough|enough|cancel|quiet|be quiet|no more|exit)\b/i],
]

export function parseReadControl(text: string): ReadControl | null {
  const t = text.trim().replace(/^[\s,.!-]+|[\s,.!?-]+$/g, '')
  if (!t || t.split(/\s+/).length > 4) return null
  return CONTROLS.find(([, re]) => re.test(t))?.[0] ?? null
}

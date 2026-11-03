/**
 * Hearing "Hey Spark" (and the old "Hey Juno" still works). The speech model often renders the name as something else ("you know", "Juneau", "junior"), so the greeting
 * ("hey", "ok", "hi") plus any of those counts, while a bare "Spark" only counts at the very start of what was said. A bare "junior" or
 * "you know" never wakes it: people say those all day.
 */
const NAME = '(?:spark|sparks|sparc|spock|spak|spar k|spa k|juno|juneau|junior|jeno|jonno|yuno|gino|geno|chuno|june o|you know|jew no|ju no|ju now|jew now|june oh|june now|jo no|joe no|you no|yo no|juneo|junno)'
const GREETED = new RegExp(`\\b(?:hey|hi|ok|okay|hello|hay|hei|eh|ay|a)\\b[\\s,.!-]*${NAME}\\b[\\s,.!?:;-]*`, 'i')
const BARE = /^\W*(?:spark|sparc|juno|juneau)\b[\s,.!?:;-]*/i

export interface Wake {
  /** What was said after the wake words (may be empty: "Hey Spark." on its own). */
  rest: string
}

export function parseWake(text: string): Wake | null {
  const m = GREETED.exec(text)
  if (m) return { rest: text.slice(m.index + m[0].length).trim() }
  const b = BARE.exec(text)
  if (b) return { rest: text.slice(b[0].length).trim() }
  return null
}

/** Leading wake words on a command that already follows a wake ("Spark, open follow-up") are dropped. */
export function stripWake(text: string): string {
  return parseWake(text)?.rest ?? text.trim()
}

const NO = /\b(no|nope|nah|cancel|don'?t|do not|stop|never ?mind|leave it|not now|wait)\b/i
const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|confirm|correct|that'?s right|go on|affirmative)\b/i

/** A spoken answer to "Shall I?": yes, no, or null when it was neither. "No" wins over "yes" ("no, don't"). */
export function parseYesNo(text: string): 'yes' | 'no' | null {
  if (NO.test(text)) return 'no'
  // A yes is a short answer: a long line that happens to contain "ok" or "sure" is not one.
  if (YES.test(text) && text.trim().split(/\s+/).length <= 5) return 'yes'
  return null
}

/** What the advisor can say while Spark is reading aloud. Only short, plain commands count, so a stray sentence never changes the reading. */
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

const wordsOf = (t: string) => t.toLowerCase().replace(/[’']/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * Which of several people the advisor meant, from what they said. {@code names} are in the order Spark listed them (most recently debriefed
 * first). Returns the 0-based position, -1 for "neither / never mind", or null when it was not clear. A name wins ("Nick Lee", "Lee"); then
 * a position ("the first one", "the second", "the other one", "the older one", "the latest").
 */
export function parseChoice(text: string, names: string[]): number | null {
  const heard = wordsOf(text)
  if (heard.length === 0) return null
  if (/\b(neither|none|nobody|no one|cancel|never ?mind|forget it)\b/i.test(text)) return -1

  // A name: the person whose name shares the most words with what was said, if that is one person only.
  const scores = names.map((n) => {
    const parts = wordsOf(n)
    return heard.filter((w) => w.length >= 2 && parts.some((p) => p === w)).length
  })
  const top = Math.max(...scores)
  if (top > 0 && scores.filter((x) => x === top).length === 1) return scores.indexOf(top)

  const has = (re: RegExp) => re.test(heard.join(' '))
  // Words that say which end of the list come before a bare number, because "the other one" and "the older one" both contain "one".
  if (has(/\b(last|older|oldest|earlier)\b/)) return names.length - 1
  if (has(/\b(other|another)\b/)) return names.length > 1 ? 1 : null
  if (has(/\b(first|1st|latest|newest|newer|recent|most recent)\b/)) return 0
  if (has(/\b(second|2nd)\b/)) return names.length > 1 ? 1 : null
  if (has(/\b(third|3rd)\b/)) return names.length > 2 ? 2 : null
  if (has(/\b(fourth|4th)\b/)) return names.length > 3 ? 3 : null
  if (has(/\b(one|1)\b/)) return 0
  if (has(/\b(two|2)\b/)) return names.length > 1 ? 1 : null
  if (has(/\b(three|3)\b/)) return names.length > 2 ? 2 : null
  return null
}

import { motion } from 'framer-motion'
import type { CopilotInsights, CustomerProfile } from '../../types'

interface Props {
  profile: CustomerProfile | null
  copilot: CopilotInsights | null
  /** Everything dictated so far, as plain text. */
  text: string
}

interface Cue {
  key: string
  title: string
  hint: string
  done: boolean
}

/**
 * A gentle guide while the advisor dictates: the things a good debrief usually covers, ticking off as the
 * system hears them. It is a prompt, not a form — nothing is required, and anything unticked is simply
 * something the advisor can still add.
 */
export function CoverageCues({ profile, copilot, text }: Props) {
  const map = copilot?.lifeMap
  const has = (re: RegExp) => re.test(text)
  const cues: Cue[] = [
    {
      key: 'who', title: 'Who they are', hint: 'Name, age, what they do',
      done: !!(profile?.customerName || profile?.age || profile?.occupation),
    },
    {
      key: 'family', title: 'Family & dependants', hint: 'Spouse, children, parents they support',
      done: (map?.people.length ?? 0) > 0 || profile?.dependents != null,
    },
    {
      key: 'goals', title: 'Goals & hopes', hint: 'What they want for themselves and their family',
      done: (map?.dreams.length ?? 0) > 0 || (profile?.goalsAndConcerns?.length ?? 0) > 0,
    },
    {
      key: 'concerns', title: 'Concerns & health', hint: 'Worries, family health history',
      done: (map?.worries.length ?? 0) > 0 || has(/\b(health|illness|cancer|diabet|hospital|medical|worr\w*|concern\w*)\b/i),
    },
    {
      key: 'money', title: 'Income & budget', hint: 'Roughly what they earn and can set aside',
      done: !!(profile?.incomeBand || profile?.budgetNotes) || has(/\b(budget|income|salary|per month|a month|afford\w*|earn\w*)\b|\$\s?\d/i),
    },
    {
      key: 'cover', title: 'Existing cover', hint: 'Policies they already have — or none',
      done: (profile?.existingPolicies?.length ?? 0) > 0 || has(/\b(insurance|polic(y|ies)|cover(age)?|insured)\b/i),
    },
  ]
  const covered = cues.filter((c) => c.done).length
  const extra = copilot?.nextQuestions ?? []

  return (
    <div className="glass-card cues">
      <div className="cues__head">
        <div className="glass-card__label">What a good debrief covers</div>
        <span className="cues__count">
          <b>{covered}</b> / {cues.length}
        </span>
      </div>
      <div className="cues__bar">
        <motion.span animate={{ width: `${(100 * covered) / cues.length}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </div>
      <ul className="cues__list">
        {cues.map((c) => (
          <li key={c.key} className={c.done ? 'is-done' : ''}>
            <span className="cues__tick" aria-hidden>{c.done ? '✓' : ''}</span>
            <span>
              <strong>{c.title}</strong>
              <small>{c.hint}</small>
            </span>
          </li>
        ))}
      </ul>
      {extra.length > 0 && (
        <div className="cues__extra">
          <span className="glass-card__label">Worth adding</span>
          {extra.map((q) => (
            <span className="ask-chip" key={q}>{q}</span>
          ))}
        </div>
      )}
    </div>
  )
}

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { generateStory } from '../../api/client'
import type { ProtectionStory, SalesReportResult } from '../../types'
import { printGoalsPlan } from '../../utils/goalsPlanPdf'
import { forLabel } from '../../utils/names'

const sgd = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`

interface Props {
  runId: string
  report: SalesReportResult
  customerName?: string | null
}

/**
 * Goals and plan — the warm, customer-facing centre of the suggestion: what the customer told us matters to
 * them, and how the suggested products support each of those goals. It carries no figures and no worst-case
 * scenarios; the advisor's cover-adequacy check lives in its own clearly-labelled, advisor-only section.
 */
export function GoalsPlan({ runId, report, customerName }: Props) {
  const [story, setStory] = useState<ProtectionStory | null>(report.story ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (report.story) setStory(report.story)
  }, [report])

  async function create() {
    setLoading(true)
    setError(null)
    try {
      setStory(await generateStory(runId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the Goals and plan view')
    } finally {
      setLoading(false)
    }
  }

  if (!story || !story.goals) {
    return (
      <div className="glass-card ff-empty">
        <div className="ff-kicker">Goals &amp; plan</div>
        <h3>{story ? 'Update this view' : 'What matters to them, and how we can help'}</h3>
        <p>
          {story
            ? 'This view was created before “Goals and plan” existed. Refresh it to see their goals and how the plan supports each one.'
            : 'A personal view built from what the customer said: their goals in their own words, and how the suggested plan supports each of them.'}
        </p>
        {error && <p className="proposal__error">{error}</p>}
        <button className="cta-btn" onClick={create} disabled={loading}>
          {loading ? 'Preparing…' : story ? 'Refresh this view' : 'Create Goals and plan'}
        </button>
      </div>
    )
  }

  return (
    <div className="ff">
      {story.review ? (
        <div className={`proposal__review${story.review.passed ? ' is-ok' : ' is-warn'}`}>
          <strong>{story.review.passed ? '✓ Compliance reviewed' : '⚠ Review before sharing with the customer'}</strong>
          {story.review.notes.length > 0 && (
            <ul>
              {story.review.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="proposal__review is-warn gp-unreviewed">
          <strong>Not yet compliance reviewed</strong>
          <span>This page was created before the review step existed.</span>
          <button className="ghost-btn" onClick={create} disabled={loading}>
            {loading ? 'Reviewing…' : 'Run the review'}
          </button>
          {error && <span className="proposal__error">{error}</span>}
        </div>
      )}

      <motion.section className="glass-card ff-hero" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="ff-kicker">Goals &amp; plan{customerName ? ` · ${customerName}` : ''}</div>
        <h2 className="ff-headline">{story.headline}</h2>
        <p className="ff-opening">{story.opening}</p>
      </motion.section>

      {story.quotes.length > 0 && (
        <section className="ff-quotes" aria-label="In their own words">
          <div className="glass-card__label">In their own words</div>
          <div className="ff-quotes__grid">
            {story.quotes.map((q, i) => (
              <motion.figure key={q.text} className="ff-quote" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.3, duration: 0.6 }}>
                <span className="ff-quote__mark">“</span>
                <blockquote>{q.text}</blockquote>
                <figcaption>{q.theme}</figcaption>
              </motion.figure>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Goals">
        <div className="glass-card__label">How we can help</div>
        <div className="gp-grid">
          {story.goals.map((g, i) => (
            <motion.article key={g.label} className="glass-card gp-goal" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.12, duration: 0.45 }}>
              <header>
                <span className="gp-goal__tick" aria-hidden>✓</span>
                <div>
                  <h4>{g.label}</h4>
                  {g.forRelation && g.forRelation !== 'Self' && <small>for {forLabel(g.forRelation)}</small>}
                </div>
              </header>
              {g.said && <q className="gp-goal__said">{g.said}</q>}
              <p>{g.support}</p>
              {g.products.length > 0 && (
                <div className="gp-goal__products">
                  {g.products.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
              )}
            </motion.article>
          ))}
        </div>
      </section>

      <section className="glass-card ff-close">
        <p className="ff-closing">{story.closing}</p>
        <div className="proposal__actions">
          <button className="cta-btn" onClick={() => printGoalsPlan(story, customerName)}>
            Leave a copy with the customer (PDF)
          </button>
        </div>
      </section>

      <AdequacyCheck story={story} />
    </div>
  )
}

/** The advisor's own sense-check of cover against income. Not for showing to the customer. */
function AdequacyCheck({ story }: { story: ProtectionStory }) {
  const [income, setIncome] = useState(story.monthlyIncome ?? 5000)
  const [expenses, setExpenses] = useState(Math.round((story.monthlyIncome ?? 5000) * 0.7))
  const rows = story.products.filter((p) => p.benefitAmount)

  return (
    <details className="glass-card gp-advisor">
      <summary>
        Advisor only — cover adequacy check <span className="live-tag">Not for the customer</span>
      </summary>
      <p className="gp-advisor__note">
        A sense-check of the sum-assured figures in the product documents against this household. The figures below are
        assumptions you can change — confirm real income and expenses with the customer before relying on them.
      </p>
      <div className="ff-fields">
        <label className="ff-field">
          <span>Household income / month {story.monthlyIncome ? '(from conversation)' : '(assumption)'}</span>
          <input type="number" min={0} step={500} value={income} onChange={(e) => setIncome(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="ff-field">
          <span>Household expenses / month (assumption)</span>
          <input type="number" min={0} step={500} value={expenses} onChange={(e) => setExpenses(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="panel-empty">No sum-assured figures were found in the product documents for this shortlist.</p>
      ) : (
        <table className="admin-table gp-advisor__table">
          <thead>
            <tr><th>Product</th><th>Benefit in documents</th><th>× yearly income</th><th>Years of expenses</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{sgd(r.benefitAmount!)}</td>
                <td>{income > 0 ? (r.benefitAmount! / (income * 12)).toFixed(1) : '—'}</td>
                <td>{expenses > 0 ? (r.benefitAmount! / (expenses * 12)).toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  )
}

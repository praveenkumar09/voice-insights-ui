import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { generateProposal } from '../../api/client'
import type { ProposalResult, SalesReportResult } from '../../types'
import { printProposal } from '../../utils/proposalPdf'

type Lang = 'en' | 'zh' | 'ms' | 'ta'
const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'ta', label: 'தமிழ்' },
]

interface Props {
  runId: string
  /** The Sales Report agent's output; its `proposal` is the English version generated with the run. */
  report: SalesReportResult | null
  customerName?: string | null
}

/**
 * The Sales Report agent's customer deliverable: a proposal the customer takes
 * home plus a ready-to-send follow-up. English comes with the run; other
 * languages are regenerated on demand by the same agent method.
 */
export function ProposalPanel({ runId, report, customerName }: Props) {
  const [cache, setCache] = useState<Partial<Record<Lang, ProposalResult>>>({})
  const [lang, setLang] = useState<Lang>('en')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (report?.proposal) setCache((c) => ({ ...c, en: report.proposal! }))
  }, [report])

  const proposal = cache[lang]

  useEffect(() => {
    if (proposal) setMessage(proposal.followUpMessage)
  }, [proposal])

  async function load(target: Lang) {
    setLang(target)
    setError(null)
    if (cache[target]) return
    setLoading(true)
    try {
      const p = await generateProposal(runId, target)
      setCache((c) => ({ ...c, [target]: p }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the proposal')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Copy failed — select the text and copy it manually')
    }
  }

  return (
    <motion.section
      className="glass-card proposal"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <header className="proposal__head">
        <div>
          <div className="glass-card__label">
            Customer proposal <span className="live-tag">Sales Report agent</span>
          </div>
          <h3 className="proposal__heading">Ready to hand to {customerName ?? 'the customer'}</h3>
        </div>
        <div className="proposal__langs" role="tablist" aria-label="Proposal language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              role="tab"
              aria-selected={lang === l.code}
              className={`proposal__lang${lang === l.code ? ' is-active' : ''}`}
              onClick={() => load(l.code)}
              disabled={loading}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="proposal__error">{error}</p>}

      {!proposal && !loading && (
        <div className="proposal__empty">
          <p>{report?.proposal === null ? 'The proposal was not generated with this run.' : 'Preparing the proposal…'}</p>
          <button className="cta-btn" onClick={() => load(lang)}>
            Generate proposal
          </button>
        </div>
      )}

      {loading && (
        <div className="proposal__loading">
          <span className="proposal__spinner" /> Writing the proposal in {LANGS.find((l) => l.code === lang)?.label}…
        </div>
      )}

      <AnimatePresence mode="wait">
        {proposal && !loading && (
          <motion.div
            key={proposal.language}
            className="proposal__body"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className={`proposal__review${proposal.review.passed ? ' is-ok' : ' is-warn'}`}>
              <strong>{proposal.review.passed ? '✓ Compliance reviewed' : '⚠ Review before sharing'}</strong>
              {proposal.review.notes.length > 0 && (
                <ul>
                  {proposal.review.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>

            <article className="proposal__doc">
              <h4>{proposal.title}</h4>
              <p className="proposal__greeting">{proposal.greeting}</p>
              <p className="proposal__summary">{proposal.summary}</p>
              {proposal.products.map((p, i) => (
                <div className="proposal__product" key={p.name}>
                  <div className="proposal__product-head">
                    <span className="proposal__rank">{i + 1}</span>
                    <strong>{p.name}</strong>
                    <span className="proposal__fit">{p.fitScore}% fit</span>
                  </div>
                  <p>{p.whyItFits}</p>
                  {p.keyBenefits.length > 0 && (
                    <ul>
                      {p.keyBenefits.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                  <p className="proposal__premium">{p.indicativePremium}</p>
                  {p.source && <span className="proposal__source">{p.source}</span>}
                </div>
              ))}
              <h5>Next steps</h5>
              <ul>
                {proposal.nextSteps.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <p className="proposal__disclaimer">{proposal.disclaimer}</p>
            </article>

            <div className="proposal__actions">
              <button className="cta-btn" onClick={() => printProposal(proposal, customerName)}>
                Download proposal (PDF)
              </button>
            </div>

            <div className="proposal__followup">
              <div className="glass-card__label">Follow-up message — edit, then send</div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
              <div className="proposal__actions">
                <button className="ghost-btn" onClick={copy}>
                  {copied ? '✓ Copied' : 'Copy message'}
                </button>
                <a className="ghost-btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                  Open in WhatsApp
                </a>
                <a className="ghost-btn" href={`mailto:?subject=${encodeURIComponent(proposal.title)}&body=${encodeURIComponent(message)}`}>
                  Email
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

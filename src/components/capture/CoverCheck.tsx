import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { lookUpCoverage } from '../../api/client'
import type { CoverageSnapshot, CustomerProfile } from '../../types'

interface Props {
  profile: CustomerProfile | null
  onSaved: (patch: Partial<CustomerProfile>) => void
  /** light: inside the Customer Profile card. dark: inside Juno's stage. */
  tone?: 'light' | 'dark'
  /** The host already lists the policies (Juno's row does); show only the check itself. */
  showTags?: boolean
}

const NRIC = /^[STFGM]\d{7}[A-Z]$/
const clean = (v: string) => v.replace(/[\s-]/g, '').toUpperCase()
const CATEGORY: Record<string, string> = {
  LIFE_TERM: 'Term life', LIFE_WHOLE: 'Whole life', CRITICAL_ILLNESS: 'Critical illness', HOSPITALISATION: 'Hospital',
  INVESTMENT_LINKED: 'Investment-linked', ENDOWMENT: 'Endowment', PERSONAL_ACCIDENT: 'Accident', ANNUITY: 'Annuity',
}

function time(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
}

function detail(p: CoverageSnapshot['policies'][number]): string {
  const sum = p.sumAssured && Number.isFinite(Number(p.sumAssured)) ? `S$${Number(p.sumAssured).toLocaleString('en-SG')} cover` : null
  return [CATEGORY[p.category ?? ''] ?? p.category, p.status?.replace('_', ' ').toLowerCase(), sum].filter(Boolean).join(' · ')
}

/**
 * Checks what the customer already holds, from the policy system, so nothing they own is suggested again.
 * The advisor TYPES the NRIC/FIN (it is stripped from every transcript); it is sent once and not kept.
 * An unreachable policy system is shown as "could not check", never as "no policies".
 */
export function CoverCheck({ profile, onSaved, tone = 'light', showTags = true }: Props) {
  const id = useId()
  const cover = profile?.coverage ?? null
  const [open, setOpen] = useState(false)
  const [nric, setNric] = useState('')
  const [show, setShow] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = clean(nric)
  const valid = NRIC.test(value)
  const ready = !!profile?.id
  const said = profile?.existingPolicies ?? []
  // A different customer's session must never inherit a typed number.
  useEffect(() => { setNric(''); setConsent(false); setError(null); setOpen(false) }, [profile?.id])

  async function check() {
    if (!profile?.id || !valid || !consent || busy) return
    setBusy(true)
    setError(null)
    try {
      onSaved({ coverage: await lookUpCoverage(profile.id, value, consent) })
      setOpen(false)
      setConsent(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check existing policies')
    } finally {
      setNric('')
      setBusy(false)
    }
  }

  const unknown = cover?.status === 'UNAVAILABLE'
  const verified = !!cover && !unknown
  const inForce = cover?.policies.filter((p) => p.status === 'IN_FORCE') ?? []
  const mismatch = !verified ? null
    : inForce.length > 0 && said.length === 0 ? 'Policies in force that the conversation did not mention. Worth confirming.'
    : cover!.policies.length === 0 && said.length > 0 ? 'Cover was mentioned, but the policy system holds none. Worth confirming.'
    : null

  return (
    <div className={`cc cc--${tone}`}>
      {verified && showTags && (
        <div className="cc__tags">
          {cover!.policies.length === 0 ? (
            <span className="cc__tag cc__tag--ok" title="Confirmed by the policy system">✓ None on record</span>
          ) : (
            cover!.policies.map((p, i) => (
              <span key={p.policyNumber ?? i} className={`cc__tag ${p.status === 'IN_FORCE' ? 'cc__tag--ok' : 'cc__tag--off'}`} title={detail(p)}>
                {p.status === 'IN_FORCE' ? '✓ ' : ''}{p.productName ?? 'Policy'}{p.status === 'IN_FORCE' ? '' : ` · ${(p.status ?? '').toLowerCase()}`}
              </span>
            ))
          )}
        </div>
      )}

      {unknown && <p className="cc__warn" role="status">Policy system unreachable. Cover is <em>unknown</em>, not “none”.</p>}
      {mismatch && <p className="cc__note" role="note">{mismatch}</p>}

      <div className="cc__line">
        {verified && (
          <span className="cc__meta">
            Verified in the policy system · {cover!.nricMasked}{time(cover!.fetchedAt) ? ` · ${time(cover!.fetchedAt)}` : ''}
          </span>
        )}
        {!open && (
          <button type="button" className={verified ? 'cc__link' : 'cc__btn'} onClick={() => setOpen(true)} disabled={!ready}
                  title={ready ? undefined : 'Available once recording has started'}>
            {verified ? 'Check again' : unknown ? 'Try again' : 'Check policy system'}
          </button>
        )}
        {!ready && !verified && <span className="cc__meta">Available once recording starts</span>}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            key="form" className="cc__form" noValidate
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}
            onSubmit={(e) => { e.preventDefault(); void check() }}
          >
            <label className="cc__field" htmlFor={`${id}-nric`}>Customer NRIC / FIN</label>
            <div className={`cc__input${value && !valid ? ' is-invalid' : ''}${valid ? ' is-valid' : ''}`}>
              <input
                id={`${id}-nric`} type={show ? 'text' : 'password'} value={nric} placeholder="S1234567D" maxLength={12}
                onChange={(e) => { setNric(e.target.value); setError(null) }}
                autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} name="customer-ref"
                disabled={busy} aria-invalid={!!value && !valid} aria-describedby={`${id}-help`} autoFocus
              />
              <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} disabled={busy}>{show ? 'Hide' : 'Show'}</button>
            </div>
            <p id={`${id}-help`} className={`cc__help${value && !valid ? ' is-error' : ''}`}>
              {value && !valid ? 'A letter, seven digits, then a letter.' : 'Typed, never spoken. Used for this check only, not stored.'}
            </p>
            <label className="cc__consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
              <span>The customer has agreed to this check.</span>
            </label>
            {error && <p className="cc__error" role="alert">{error}</p>}
            <div className="cc__actions">
              <button type="submit" className="cc__go" disabled={!valid || !consent || busy}>{busy ? 'Checking…' : 'Check'}</button>
              {!busy && <button type="button" className="cc__link" onClick={() => { setOpen(false); setNric(''); setError(null) }}>Cancel</button>}
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}

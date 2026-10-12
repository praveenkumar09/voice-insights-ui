import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { lookUpCoverage } from '../../api/client'
import type { CoverageSnapshot, CustomerProfile, HeldPolicy } from '../../types'

interface Props {
  profile: CustomerProfile | null
  onSaved: (patch: Partial<CustomerProfile>) => void
}

const NRIC = /^[STFGM]\d{7}[A-Z]$/
const clean = (v: string) => v.replace(/[\s-]/g, '').toUpperCase()

const CATEGORY: Record<string, string> = {
  LIFE_TERM: 'Term life',
  LIFE_WHOLE: 'Whole life',
  CRITICAL_ILLNESS: 'Critical illness',
  HOSPITALISATION: 'Hospital',
  INVESTMENT_LINKED: 'Investment-linked',
  ENDOWMENT: 'Endowment',
  PERSONAL_ACCIDENT: 'Accident',
  ANNUITY: 'Annuity',
}
const STATUS: Record<string, string> = { IN_FORCE: 'In force', LAPSED: 'Lapsed', SURRENDERED: 'Surrendered', MATURED: 'Matured', CLAIMED: 'Claimed' }

function money(v: string | null): string | null {
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? `S$${n.toLocaleString('en-SG', { maximumFractionDigits: 0 })}` : null
}

function time(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
}

/**
 * "What do they already hold?" The advisor types the customer's NRIC/FIN (never spoken: it is stripped from every
 * transcript) and the policy system answers. Everything downstream (Juno's questions, the live copilot, the agents'
 * shortlist) then leaves out products the customer already owns. The number is sent once and not kept.
 * An unreachable policy system is shown as "could not check", never as "no policies".
 */
export function ExistingCoverPanel({ profile, onSaved }: Props) {
  const id = useId()
  const cover = profile?.coverage ?? null
  const [nric, setNric] = useState('')
  const [show, setShow] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const value = clean(nric)
  const valid = NRIC.test(value)
  const ready = !!profile?.id
  // Another customer's session must never inherit this one's typed number.
  useEffect(() => { setNric(''); setConsent(false); setError(null); setEditing(false) }, [profile?.id])

  async function check() {
    if (!profile?.id || !valid || !consent || busy) return
    setBusy(true)
    setError(null)
    try {
      const snapshot = await lookUpCoverage(profile.id, value, consent)
      onSaved({ coverage: snapshot })
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check existing policies')
    } finally {
      setNric('') // the number is used once and not kept on screen
      setBusy(false)
    }
  }

  const showForm = !cover || editing || cover.status === 'UNAVAILABLE'
  const state = busy ? 'checking' : !cover || editing ? 'idle' : cover.status === 'UNAVAILABLE' ? 'unknown' : 'verified'
  const pill = { idle: editing ? 'Checking again' : 'Not checked', checking: 'Checking…', unknown: 'Could not check', verified: 'Verified' }[state]

  return (
    <div className={`glass-card cover cover--${state}`} aria-busy={busy}>
      <div className="cover__head">
        <div className="glass-card__label">Existing cover</div>
        <span className={`cover__pill cover__pill--${state}`}>
          <i aria-hidden />
          {pill}
        </span>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {cover && cover.status !== 'UNAVAILABLE' && !editing && !busy && (
          <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} aria-live="polite">
            <Result cover={cover} said={profile?.existingPolicies ?? []} />
            <div className="cover__foot">
              <span>
                <b>{cover.nricMasked}</b>
                {time(cover.fetchedAt) && <> · checked {time(cover.fetchedAt)}</>}
              </span>
              <button type="button" className="cover__link" onClick={() => { setConsent(false); setEditing(true) }} disabled={!ready}>Check again</button>
            </div>
          </motion.div>
        )}

        {cover?.status === 'UNAVAILABLE' && !busy && (
          <motion.p key="unknown" className="cover__notice" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <strong>The policy system could not be reached.</strong> Existing cover is <em>unknown</em>, not “none”, so the suggestions will
            rely only on what was said in the conversation. Try again below.
          </motion.p>
        )}
      </AnimatePresence>

      {showForm && (
        <form className="cover__form" onSubmit={(e) => { e.preventDefault(); void check() }} noValidate>
          {!cover && (
            <p className="cover__intro">
              Check what the customer already holds, so nothing they own is suggested again.
            </p>
          )}
          <label className="cover__field" htmlFor={`${id}-nric`}>
            <span>Customer NRIC / FIN</span>
            <div className={`cover__input${value && !valid ? ' is-invalid' : ''}${valid ? ' is-valid' : ''}`}>
              <input
                id={`${id}-nric`}
                type={show ? 'text' : 'password'}
                value={nric}
                onChange={(e) => { setNric(e.target.value); setError(null) }}
                placeholder="S1234567D"
                maxLength={12}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                name="customer-ref"
                disabled={busy || !ready}
                aria-invalid={!!value && !valid}
                aria-describedby={`${id}-help`}
              />
              <button type="button" className="cover__eye" onClick={() => setShow((s) => !s)} aria-pressed={show} disabled={busy}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <p id={`${id}-help`} className={`cover__help${value && !valid ? ' is-error' : ''}`}>
            {value && !valid ? 'Looks incomplete: a letter, seven digits, then a letter.' : 'Typed, never spoken. Used for this check only and not stored.'}
          </p>

          <label className="cover__consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy || !ready} />
            <span>The customer has agreed to a check of their existing policies.</span>
          </label>

          {error && <p className="cover__error" role="alert">{error}</p>}

          <div className="cover__actions">
            <button type="submit" className="cta-btn cover__go" disabled={!ready || !valid || !consent || busy}>
              {busy ? 'Asking the policy system…' : cover?.status === 'UNAVAILABLE' ? 'Try again' : 'Check policies'}
            </button>
            {editing && !busy && <button type="button" className="ghost-btn" onClick={() => { setEditing(false); setNric('') }}>Cancel</button>}
          </div>
          {!ready && <p className="cover__help">Available as soon as recording starts.</p>}
        </form>
      )}
    </div>
  )
}

function Result({ cover, said }: { cover: CoverageSnapshot; said: string[] }) {
  const inForce = cover.policies.filter((p) => p.status === 'IN_FORCE')
  const none = cover.policies.length === 0
  // Two sources can disagree; show both and say so rather than quietly choosing one.
  const mismatch = !none && inForce.length > 0 && said.length === 0
    ? 'The customer has policies in force that the conversation did not mention.'
    : none && said.length > 0
      ? 'Cover was mentioned in the conversation, but the policy system holds none.'
      : null

  return (
    <>
      {none ? (
        <p className="cover__none">
          <span aria-hidden>✓</span>
          <span><strong>No policies on record.</strong> The policy system confirms the customer holds none.</span>
        </p>
      ) : (
        <>
          <ul className="cover__list">
            {cover.policies.map((p, i) => <Policy key={p.policyNumber ?? i} p={p} />)}
          </ul>
          {inForce.length > 0 && <p className="cover__rule">Products already held are left out of the suggestions.</p>}
        </>
      )}
      <div className="cover__said">
        <span>In the conversation</span>
        <p>{said.length ? said.join(' · ') : 'Nothing mentioned'}</p>
      </div>
      {mismatch && <p className="cover__flag" role="note">{mismatch} Worth confirming with the customer.</p>}
    </>
  )
}

function Policy({ p }: { p: HeldPolicy }) {
  const live = p.status === 'IN_FORCE'
  const sum = money(p.sumAssured)
  return (
    <li className={live ? '' : 'is-inactive'}>
      <div className="cover__row">
        <strong>{p.productName ?? 'Unnamed policy'}</strong>
        <span className={`cover__chip cover__chip--${live ? 'live' : 'off'}`}>{STATUS[p.status ?? ''] ?? p.status}</span>
      </div>
      <small>
        {[CATEGORY[p.category ?? ''] ?? p.category, p.insurer && p.insurer !== 'AIA' ? p.insurer : null, sum && `${sum} cover`].filter(Boolean).join(' · ')}
      </small>
    </li>
  )
}

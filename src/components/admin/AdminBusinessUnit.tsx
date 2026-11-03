import { useEffect, useMemo, useRef, useState } from 'react'
import { saveSettings, type LangId } from '../../api/client'
import { infoOf } from '../../utils/languages'
import { setTenant, useTenant } from '../../utils/tenant'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * Admin: the business unit Spark speaks for, and the languages it offers. Saving changes the whole app at once: the name Spark
 * introduces itself with, what every prompt says about the country, the currency of every amount (and of the PDFs) and the language
 * choices on every screen.
 */
export function AdminBusinessUnit() {
  const saved = useTenant()
  const [buId, setBuId] = useState(saved.businessUnit)
  const [langs, setLangs] = useState<LangId[]>(saved.languages)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { setBuId(saved.businessUnit); setLangs(saved.languages) }, [saved.businessUnit, saved.languages.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const units = saved.units
  const bu = units.find((u) => u.id === buId) ?? saved.unit
  const available = saved.available.length ? saved.available : [{ code: 'en' as LangId, name: 'English' }]
  const ordered = useMemo(() => available.map((a) => a.code).filter((c) => langs.includes(c)), [available, langs])
  const dirty = buId !== saved.businessUnit || !sameSet(langs, saved.languages)
  const tooFew = langs.length < saved.minLanguages

  function pick(id: string) {
    setBuId(id); setDone(false); setError(null)
    const next = units.find((u) => u.id === id)
    if (next) setLangs(next.defaultLanguages) // each unit starts from the languages its customers usually speak
  }
  const toggle = (c: LangId) => { setDone(false); setError(null); setLangs((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])) }

  async function save() {
    setBusy(true); setError(null)
    try { setTenant(await saveSettings(buId, ordered)); setDone(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }

  // 100,000 SGD in the unit's currency, to three significant figures like the server does
  const raw = 100000 * bu.perSgd
  const step = 10 ** (String(Math.round(raw)).length - 3)
  const example = bu.perSgd === 1 ? 'S$100,000' : `${bu.currency} ${(Math.round(raw / step) * step).toLocaleString('en-US')}`

  return (
    <div className="adm-dash bu">
      <header className="adm-hero adm-hero--compact">
        <div className="adm-hero__glow adm-hero__glow--a" />
        <div className="adm-hero__top">
          <div>
            <span className="adm-hero__eyebrow">Business unit</span>
            <h2>Who Spark speaks for, and in which languages</h2>
          </div>
          <div className="adm-hero__count"><b>{saved.unit.name.replace('AIA ', '')}</b><span>{saved.languages.length} languages · {saved.unit.currency}</span></div>
        </div>
      </header>

      <section className="adm-card bu__card">
        <h3 className="bu__h">1 · Business unit</h3>
        <div className="bu__units" role="radiogroup" aria-label="Business unit">
          {units.map((u) => (
            <button key={u.id} role="radio" aria-checked={u.id === buId} className={`bu__unit${u.id === buId ? ' is-on' : ''}`} onClick={() => pick(u.id)}>
              <b>{u.name}</b>
              <span>{u.currency}{u.id === saved.businessUnit ? ' · current' : ''}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="adm-card bu__card">
        <h3 className="bu__h">2 · Languages</h3>
        <p className="bu__sub">Spark listens and speaks in these. Customers and advisors choose among them on every screen. Choose as few or as many as you need.</p>
        <div className="bu__combo" ref={box}>
          <button className="bu__trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="bu__chips">
              {ordered.length === 0 && <i className="bu__none">Choose languages</i>}
              {ordered.map((c) => <em key={c}>{infoOf(c).native}</em>)}
            </span>
            <span className="bu__count">{ordered.length} of {available.length}</span>
            <span className="bu__caret" aria-hidden>▾</span>
          </button>
          {open && (
            <ul className="bu__list" role="listbox" aria-multiselectable="true">
              {available.map((a) => (
                <li key={a.code} role="option" aria-selected={langs.includes(a.code)}>
                  <label>
                    <input type="checkbox" checked={langs.includes(a.code)} onChange={() => toggle(a.code)} />
                    <span className="bu__lname">{a.name}</span>
                    <span className="bu__nat">{infoOf(a.code).native}</span>
                  </label>
                </li>
              ))}
              <li className="bu__quick">
                <button onClick={() => setLangs(available.map((a) => a.code))}>Select all</button>
                <button onClick={() => setLangs(bu.defaultLanguages)}>Usual for {bu.name.replace('AIA ', '')}</button>
              </li>
            </ul>
          )}
        </div>
      </section>

      <section className="adm-card bu__card">
        <h3 className="bu__h">What changes</h3>
        <dl className="bu__facts">
          <div><dt>Spark introduces itself as</dt><dd>“…your {bu.name} digital suggestion assistant”</dd></div>
          <div><dt>Prompts and the voice model</dt><dd>Written for {bu.country}: the unit, the country, the names and terms to expect</dd></div>
          <div><dt>Amounts, screens and PDFs</dt><dd>In {bu.currency}{bu.perSgd === 1 ? '' : <> · the product documents are in SGD, so a figure like S$100,000 reads about <b>{example}</b></>}</dd></div>
          {bu.perSgd !== 1 && <div><dt>Rate used</dt><dd>1 SGD = {bu.perSgd.toLocaleString('en-US')} {bu.currency} · <span className="bu__warn">indicative proof-of-concept rate, not a live rate</span></dd></div>}
          <div><dt>Form hints</dt><dd>Income “{bu.incomeExample}”, budget “{bu.budgetExample}”</dd></div>
        </dl>
        {bu.id === 'id' && <p className="bu__note">Bahasa Indonesia is not one of Spark’s languages yet, so AIA Indonesia starts with English.</p>}
        <div className="bu__actions">
          <button className="kb-btn" disabled={!dirty || busy || tooFew} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          {dirty && !busy && <button className="kb-link" onClick={() => { setBuId(saved.businessUnit); setLangs(saved.languages); setError(null) }}>Discard changes</button>}
          {tooFew && <span className="adm-error">Choose at least {saved.minLanguages} language.</span>}
          {error && <span className="adm-error">{error}</span>}
          {done && !dirty && <span className="bu__ok" role="status">Saved. Spark now speaks for {saved.unit.name}.</span>}
        </div>
        <p className="bu__fine">Runs and debriefs already captured keep the wording and amounts they were made with.</p>
      </section>
    </div>
  )
}

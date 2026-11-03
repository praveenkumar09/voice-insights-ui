import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  activateCampaign, archiveCampaign, campaignImageUrl, deleteCampaign, listCampaigns, pauseCampaign, probeCampaigns, reanalyseCampaign, saveCampaign, uploadCampaign,
  type CampaignOverview, type CampaignProbe,
} from '../../api/client'
import type { Campaign } from '../../types'
import { useTenant } from '../../utils/tenant'
import { PosterLightbox } from '../workspace/PosterLightbox'

const STATUS_LABEL: Record<Campaign['status'], string> = { DRAFT: 'Draft', ACTIVE: 'Live', PAUSED: 'Paused', ARCHIVED: 'Archived' }
const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean)
const todayIso = () => new Date().toISOString().slice(0, 10)

/** Is it showing to customers right now (status and dates, ignoring business unit)? */
function runsNow(c: Campaign): boolean {
  const t = todayIso()
  return c.status === 'ACTIVE' && (!c.startsOn || c.startsOn <= t) && (!c.endsOn || c.endsOn >= t)
}

function datesText(c: Campaign): string {
  if (c.startsOn && c.endsOn) return `${c.startsOn} to ${c.endsOn}`
  if (c.endsOn) return `Until ${c.endsOn}`
  if (c.startsOn) return `From ${c.startsOn}`
  return 'No dates'
}

/**
 * Admin → Campaigns. Upload a poster; Spark reads it (a few seconds) into a draft; the admin reviews what was read, corrects it, sets the dates and
 * business units, and makes it live. "Test matching" shows how a sentence relates to every campaign, so a campaign can be checked before it is live.
 */
export function AdminCampaigns() {
  const tenant = useTenant()
  const [data, setData] = useState<CampaignOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try { setData(await listCampaigns()); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load campaigns') }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  // Posters being read finish by themselves: look again until none is.
  const reading = data?.campaigns.some((c) => c.analysisStatus === 'ANALYZING') ?? false
  useEffect(() => {
    if (!reading) return
    const t = window.setInterval(() => void refresh(), 2500)
    return () => window.clearInterval(t)
  }, [reading, refresh])

  async function send(file: File | undefined) {
    if (!file) return
    setUploading(true); setError(null)
    try {
      const c = await uploadCampaign(file)
      await refresh()
      setOpenId(c.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload')
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  const campaigns = data?.campaigns ?? []
  const live = campaigns.filter(runsNow).length
  const open = campaigns.find((c) => c.id === openId) ?? null

  return (
    <div className="adm-dash cmp">
      <header className="adm-hero adm-hero--compact">
        <div className="adm-hero__glow adm-hero__glow--a" />
        <div className="adm-hero__top">
          <div>
            <span className="adm-hero__eyebrow">Campaigns</span>
            <h2>Posters Spark can suggest to customers</h2>
          </div>
          <div className="adm-hero__count"><b>{live}</b><span>live now · {data?.businessUnitName ?? tenant.unit.name}</span></div>
        </div>
      </header>

      {error && <p className="adm-error">{error}</p>}

      <section className="adm-card">
        <div
          className={`kb-drop${over ? ' is-over' : ''}${uploading ? ' is-busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!uploading) void send(e.dataTransfer.files[0]) }}
        >
          <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => void send(e.target.files?.[0])} />
          <div className="kb-drop__icon" aria-hidden>⬆</div>
          <div className="kb-drop__text">
            <b>{uploading ? 'Uploading the poster…' : 'Add a campaign poster'}</b>
            <span>Drop a PNG or JPG here (up to 8 MB). Spark reads it into a draft for you to check. Nothing reaches a customer until you make it live.</span>
          </div>
          <button className="kb-btn" disabled={uploading} onClick={() => input.current?.click()}>Choose image</button>
        </div>
      </section>

      <section className="adm-card cmp__grid-card">
        <h3 className="cmp__h">All campaigns <small>{campaigns.length}</small></h3>
        {campaigns.length === 0 && data && <p className="cmp__empty">No campaigns yet. Add a poster above; it will appear here.</p>}
        <div className="cmp__grid">
          {campaigns.map((c) => (
            <button key={c.id} className={`cmp__tile${c.id === openId ? ' is-open' : ''}`} onClick={() => setOpenId(c.id === openId ? null : c.id)}>
              <span className="cmp__thumb">{c.hasImage ? <img src={campaignImageUrl(c.id, 'thumb', c.updatedAt)} alt="" loading="lazy" /> : null}</span>
              <span className="cmp__tile-body">
                <b>{c.name}</b>
                <span className={`cmp__pill cmp__pill--${c.analysisStatus === 'ANALYZING' ? 'reading' : c.analysisStatus === 'FAILED' ? 'failed' : runsNow(c) ? 'live' : c.status.toLowerCase()}`}>
                  {c.analysisStatus === 'ANALYZING' ? 'Reading poster…' : c.analysisStatus === 'FAILED' ? 'Could not read' : runsNow(c) ? 'Live' : c.status === 'ACTIVE' ? 'Live, outside its dates' : STATUS_LABEL[c.status]}
                </span>
                <small>{c.analysisStatus === 'READY' ? datesText(c) : ''}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {open && <CampaignEditor key={open.id + open.updatedAt} campaign={open} onChanged={refresh} onClose={() => setOpenId(null)} onDeleted={() => { setOpenId(null); void refresh() }} />}

      <TestMatching threshold={data?.minSimilarity ?? 0.34} />
    </div>
  )
}

// ── the review and edit panel ────────────────────────────────────────────────────────────────────────────────

function CampaignEditor({ campaign: c, onChanged, onClose, onDeleted }: { campaign: Campaign; onChanged: () => Promise<void>; onClose: () => void; onDeleted: () => void }) {
  const tenant = useTenant()
  const [f, setF] = useState(() => ({
    name: c.name, summary: c.summary ?? '', themes: c.themes.join(', '), benefits: c.benefits.join('\n'), signals: c.customerSignals.join('\n'),
    minAge: c.minAge?.toString() ?? '', maxAge: c.maxAge?.toString() ?? '', audienceNote: c.audienceNote ?? '', startsOn: c.startsOn ?? '', endsOn: c.endsOn ?? '',
    businessUnits: c.businessUnits, callToAction: c.callToAction ?? '', terms: c.terms ?? '',
  }))
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [zoom, setZoom] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ready = c.analysisStatus === 'READY'

  const fields = useMemo(() => ({
    name: f.name.trim(), summary: f.summary.trim(), themes: f.themes.split(',').map((x) => x.trim()).filter(Boolean), benefits: lines(f.benefits),
    customerSignals: lines(f.signals), minAge: f.minAge.trim() === '' ? null : Number(f.minAge), maxAge: f.maxAge.trim() === '' ? null : Number(f.maxAge),
    audienceNote: f.audienceNote.trim() || null, startsOn: f.startsOn || null, endsOn: f.endsOn || null, businessUnits: f.businessUnits,
    callToAction: f.callToAction.trim() || null, terms: f.terms.trim() || null,
  }), [f])
  const dirty = JSON.stringify(fields) !== JSON.stringify({
    name: c.name, summary: c.summary ?? '', themes: c.themes, benefits: c.benefits, customerSignals: c.customerSignals, minAge: c.minAge, maxAge: c.maxAge,
    audienceNote: c.audienceNote, startsOn: c.startsOn, endsOn: c.endsOn, businessUnits: c.businessUnits, callToAction: c.callToAction, terms: c.terms,
  })

  async function run(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label); setMsg(null)
    try { await fn(); await onChanged(); setMsg({ ok: true, text: done }) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' }) } finally { setBusy(null) }
  }
  const save = () => run('save', () => saveCampaign(c.id, fields as Partial<Campaign>), 'Saved.')
  const live = c.status === 'ACTIVE'
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  const toggleBu = (id: string) => setF((p) => ({ ...p, businessUnits: p.businessUnits.includes(id) ? p.businessUnits.filter((x) => x !== id) : [...p.businessUnits, id] }))

  return (
    <section className="adm-card cmp__editor" aria-label={`Edit ${c.name}`}>
      <div className="cmp__editor-head">
        <h3>{c.name}</h3>
        <button className="kb-link" onClick={onClose}>Close</button>
      </div>
      <div className="cmp__editor-body">
        <div className="cmp__poster">
          {c.hasImage && <button type="button" onClick={() => setZoom(true)} aria-label="Enlarge the poster"><img src={campaignImageUrl(c.id, 'main', c.updatedAt)} alt={`${c.name} poster`} /></button>}
          {ready && c.confidence && <p className={`cmp__conf cmp__conf--${c.confidence}`}>Read with {c.confidence} confidence{c.confidence === 'low' ? ': please check every field' : ''}</p>}
        </div>

        <div className="cmp__form">
          {c.analysisStatus === 'ANALYZING' && <p className="cmp__note"><span className="proposal__spinner" /> Spark is reading the poster. This takes a few seconds.</p>}
          {c.analysisStatus === 'FAILED' && (
            <p className="cmp__note cmp__note--bad">{c.analysisError ?? 'The poster could not be read.'} <button className="kb-link" disabled={!!busy} onClick={() => run('reread', () => reanalyseCampaign(c.id), 'Reading the poster again…')}>Try again</button></p>
          )}
          {ready && (
            <>
              <label>Name<input value={f.name} onChange={set('name')} maxLength={80} /></label>
              <label>What it is<textarea rows={3} value={f.summary} onChange={set('summary')} maxLength={400} /></label>
              <label>Themes <small>comma separated</small><input value={f.themes} onChange={set('themes')} /></label>
              <label>What it offers <small>one per line, as the poster says</small><textarea rows={4} value={f.benefits} onChange={set('benefits')} /></label>
              <label>
                What a customer might say that this campaign answers <small>one per line. This is what debriefs are matched against: add the different ways people say it.</small>
                <textarea rows={6} value={f.signals} onChange={set('signals')} />
              </label>
              <div className="cmp__row">
                <label>Starts<input type="date" value={f.startsOn} onChange={set('startsOn')} /></label>
                <label>Ends<input type="date" value={f.endsOn} onChange={set('endsOn')} /></label>
                <label>Minimum age<input inputMode="numeric" value={f.minAge} onChange={set('minAge')} /></label>
                <label>Maximum age<input inputMode="numeric" value={f.maxAge} onChange={set('maxAge')} /></label>
              </div>
              <label>Who may join <small>as the poster states it</small><input value={f.audienceNote} onChange={set('audienceNote')} /></label>
              <fieldset className="cmp__bus">
                <legend>Business units <small>{f.businessUnits.length === 0 ? 'none chosen: every unit' : `${f.businessUnits.length} chosen`}</small></legend>
                {tenant.units.map((u) => (
                  <label key={u.id} className="cmp__check"><input type="checkbox" checked={f.businessUnits.includes(u.id)} onChange={() => toggleBu(u.id)} />{u.name}</label>
                ))}
              </fieldset>
              <label>What the poster asks the reader to do<input value={f.callToAction} onChange={set('callToAction')} /></label>
              <label>Terms and conditions <small>as written on the poster</small><textarea rows={2} value={f.terms} onChange={set('terms')} /></label>
              {c.verbatimText && <details className="cmp__verbatim"><summary>Everything Spark read on the poster</summary><pre>{c.verbatimText}</pre></details>}
            </>
          )}

          {msg && <p className={msg.ok ? 'cmp__ok' : 'adm-error'} role="status">{msg.text}</p>}
          <div className="cmp__actions">
            {ready && <button className="kb-btn" disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>}
            {ready && !live && <button className="kb-btn cmp__go" disabled={!!busy || dirty} title={dirty ? 'Save your changes first' : ''} onClick={() => run('go', () => activateCampaign(c.id), 'It is live: Spark can now suggest it.')}>{busy === 'go' ? 'Going live…' : 'Make live'}</button>}
            {live && <button className="kb-btn" disabled={!!busy} onClick={() => run('pause', () => pauseCampaign(c.id), 'Paused: Spark will not suggest it.')}>Pause</button>}
            {ready && c.status !== 'ARCHIVED' && <button className="kb-link" disabled={!!busy} onClick={() => run('archive', () => archiveCampaign(c.id), 'Archived.')}>Archive</button>}
            {c.hasImage && <button className="kb-link" disabled={!!busy} onClick={() => run('reread', () => reanalyseCampaign(c.id), 'Reading the poster again…')}>Read the poster again</button>}
            <button className={`kb-link${confirmDelete ? ' is-sure' : ''}`} disabled={!!busy} onBlur={() => setConfirmDelete(false)}
              onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return } void deleteCampaign(c.id).then(onDeleted).catch((e) => setMsg({ ok: false, text: String(e.message ?? e) })) }}>
              {confirmDelete ? 'Click again to delete for good' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
      {zoom && <PosterLightbox campaignId={c.id} name={c.name} version={c.updatedAt} onClose={() => setZoom(false)} />}
    </section>
  )
}

// ── test matching ────────────────────────────────────────────────────────────────────────────────────────────

function TestMatching({ threshold }: { threshold: number }) {
  const [text, setText] = useState('He is interested to maintain his fitness.')
  const [rows, setRows] = useState<CampaignProbe[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true); setError(null)
    try { setRows((await probeCampaigns(text)).results) } catch (e) { setError(e instanceof Error ? e.message : 'Could not test') } finally { setBusy(false) }
  }

  return (
    <section className="adm-card cmp__test">
      <h3 className="cmp__h">Test matching</h3>
      <p className="cmp__sub">Type what a customer might say. This shows how close each campaign is in meaning, including drafts, so you can check one before making it live.</p>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="What the customer says" />
      <div className="cmp__actions"><button className="kb-btn" disabled={busy || !text.trim()} onClick={run}>{busy ? 'Checking…' : 'Check'}</button></div>
      {error && <p className="adm-error">{error}</p>}
      {rows && rows.length === 0 && <p className="cmp__empty">No campaign has been read yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="cmp__results">
          {rows.map((r) => (
            <li key={r.campaignId}>
              <div className="cmp__res-top"><b>{r.name}</b><span className={`cmp__pill cmp__pill--${r.live ? 'live' : r.status.toLowerCase()}`}>{r.live ? 'Live' : STATUS_LABEL[r.status as Campaign['status']] ?? r.status}</span>
                <span className={r.aboveThreshold ? 'cmp__fit' : 'cmp__nofit'}>{r.aboveThreshold ? 'Close enough to suggest' : 'Not close enough'}</span></div>
              <div className="cmp__bar" title={`Similarity ${r.score.toFixed(2)}`}><i style={{ width: `${Math.max(2, Math.min(100, r.score * 100))}%` }} /><s style={{ left: `${threshold * 100}%` }} /></div>
              <small>Closest to: “{r.bestSignal}”</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

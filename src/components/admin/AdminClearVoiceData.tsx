import { useEffect, useState } from 'react'
import { clearVoiceData, getVoiceData, type VoiceDataOverview } from '../../api/client'

/**
 * Admin: remove the captured conversations so the app is quick for a demo. Two taps (never a browser dialog): "Clear voice data", then
 * "Yes, clear it". Product documents, campaigns, users and settings are listed as kept and are never touched.
 */
export function AdminClearVoiceData({ onCleared }: { onCleared: () => void }) {
  const [data, setData] = useState<VoiceDataOverview | null>(null)
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => getVoiceData().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not read the voice data'))
  useEffect(() => { void load() }, [])

  async function run() {
    setStep('busy'); setError(null); setMessage(null)
    try {
      const r = await clearVoiceData()
      setMessage(`Cleared ${r.removed.toLocaleString()} records. Product documents, campaigns and users were not touched.`)
      await load()
      onCleared()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the voice data')
    } finally {
      setStep('idle')
    }
  }

  const total = data?.total ?? 0
  return (
    <section className="adm-card cvd" aria-label="Clear voice data">
      <div className="cvd__top">
        <div>
          <h3 className="cvd__h">Clear voice data</h3>
          <p className="cvd__p">
            Removes captured conversations, suggestion runs, advice packs, questions and what-ifs, so the app stays quick for a demo.
            {data && <> Right now: <b>{total.toLocaleString()}</b> records.</>}
          </p>
        </div>
        <div className="cvd__actions">
          {step === 'confirm' ? (
            <>
              <button className="cvd__btn cvd__btn--danger" onClick={() => void run()}>Yes, clear it</button>
              <button className="cvd__btn" onClick={() => setStep('idle')}>Cancel</button>
            </>
          ) : (
            <button className="cvd__btn cvd__btn--danger" disabled={step === 'busy' || total === 0} onClick={() => setStep('confirm')}>
              {step === 'busy' ? 'Clearing…' : 'Clear voice data'}
            </button>
          )}
        </div>
      </div>
      {data && (
        <ul className="cvd__list">
          {data.tables.map((t) => <li key={t.table}><span>{t.label}</span><b>{t.rows.toLocaleString()}</b></li>)}
        </ul>
      )}
      <p className="cvd__kept">Kept: {data ? data.kept.join(' · ') : 'product documents, campaigns, users, settings'}.</p>
      {message && <p className="cvd__ok" role="status">{message}</p>}
      {error && <p className="adm-error">{error}</p>}
    </section>
  )
}

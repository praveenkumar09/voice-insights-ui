import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteKnowledge, getKnowledgeJob, listKnowledge, uploadKnowledgeZip, type KnowledgeFile, type KnowledgeJob, type KnowledgeProduct } from '../../api/client'
import { timeAgo } from './format'

const CATEGORIES = ['Product Summary', 'Fact Sheet', 'Contract', 'Rider', 'FAQ', 'Others']
const STATUS_LABEL: Record<string, string> = { waiting: 'Waiting', working: 'Embedding…', done: 'Added', empty: 'No text', failed: 'Failed' }

/** Postgres writes "2026-10-02 11:50:07.68+00"; the browser needs "2026-10-02T11:50:07.68+00:00". */
const isoOf = (t: string) => t.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')

/** Add policy documents as a zip; they are read, split, embedded and become searchable by Juno and the suggestion agents. */
export function AdminKnowledge() {
  const [products, setProducts] = useState<KnowledgeProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<KnowledgeJob | null>(null)
  const [over, setOver] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => listKnowledge().then(setProducts).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false)), [])
  useEffect(() => { void refresh() }, [refresh])

  // Follow a running upload until it ends.
  useEffect(() => {
    if (!job || job.state !== 'running') return
    const t = window.setInterval(() => {
      getKnowledgeJob(job.id).then((j) => { setJob(j); if (j.state !== 'running') void refresh() }).catch(() => { /* try again on the next tick */ })
    }, 1500)
    return () => window.clearInterval(t)
  }, [job, refresh])

  const send = (file: File | undefined) => {
    if (!file) return
    setError(null)
    uploadKnowledgeZip(file).then(setJob).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Upload failed'))
    if (input.current) input.current.value = ''
  }

  const remove = (product: string, doc?: KnowledgeFile) => {
    const key = doc ? `${product}|${doc.category}|${doc.sourceFile}` : product
    if (confirm !== key) { setConfirm(key); return }
    setConfirm(null)
    deleteKnowledge(product, doc).then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to remove'))
  }

  const running = job?.state === 'running'
  const total = products.reduce((n, p) => n + p.chunks, 0)
  const finished = job ? job.files.filter((f) => f.status !== 'waiting' && f.status !== 'working').length : 0

  return (
    <div className="adm-dash kb">
      <header className="adm-hero adm-hero--compact">
        <div className="adm-hero__glow adm-hero__glow--a" />
        <div className="adm-hero__top">
          <div>
            <span className="adm-hero__eyebrow">Knowledge base</span>
            <h2>The documents Juno can quote from</h2>
          </div>
          <div className="adm-hero__count"><b>{total.toLocaleString()}</b><span>passages · {products.length} products</span></div>
        </div>
      </header>

      {error && <p className="adm-error">{error}</p>}

      <section className="adm-card kb-drop-card">
        <div
          className={`kb-drop${over ? ' is-over' : ''}${running ? ' is-busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!running) send(e.dataTransfer.files[0]) }}
        >
          <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => send(e.target.files?.[0])} />
          <div className="kb-drop__icon" aria-hidden>⬆</div>
          <div className="kb-drop__text">
            <b>{running ? 'Working on your upload…' : 'Add a policy or product'}</b>
            <span>Drop a .zip here, or choose one. New products are added; a product that already exists is topped up, and a file with the same name is replaced.</span>
          </div>
          <button className="kb-btn" disabled={running} onClick={() => input.current?.click()}>Choose zip</button>
        </div>
        <div className="kb-layout">
          <b>How to arrange the zip</b>
          <pre>{`Product name/
  Product Summary/  summary.pdf
  Fact Sheet/       facts.pdf
  Contract/         policy-contract.pdf
  Rider/            rider-a.pdf  rider-b.pdf
  FAQ/              faq.pdf
  Others/           notes.txt`}</pre>
          <span>Folders: {CATEGORIES.join(', ')}; any other folder inside a product is added as Others, and sub-folders are fine. Files: .pdf, .txt, .md. Scanned PDFs with no text can’t be read.</span>
        </div>
      </section>

      {job && (
        <section className={`adm-card kb-job kb-job--${job.state}`}>
          <div className="kb-job__head">
            <div>
              <b>{job.zipName}</b>
              <span>{job.message}</span>
            </div>
            {running && <div className="kb-progress"><i style={{ width: `${job.files.length ? (finished / job.files.length) * 100 : 5}%` }} /></div>}
          </div>
          {job.files.length > 0 && (
            <ul className="kb-files">
              {job.files.map((f, i) => (
                <li key={i} className={`is-${f.status}`}>
                  <span className="kb-files__name">{f.product} <em>/ {f.category} /</em> {f.file}</span>
                  <span className="kb-files__state">{STATUS_LABEL[f.status]}{f.status === 'done' ? ` · ${f.chunks}` : ''}</span>
                  {f.message && <small>{f.message}</small>}
                </li>
              ))}
            </ul>
          )}
          {job.warnings.length > 0 && (
            <details className="kb-warn"><summary>{job.warnings.length} files skipped</summary><ul>{job.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
          )}
        </section>
      )}

      {!products.length && loading && <p className="adm-status">Loading…</p>}
      {!products.length && !loading && <p className="adm-status">Nothing loaded yet. Add a zip above.</p>}

      {products.length > 0 && (
        <section className="adm-card kb-products">
          <ul>
            {products.map((p) => (
              <li key={p.productName}>
                <div className="kb-row">
                  <button className="kb-row__main" aria-expanded={open === p.productName} onClick={() => setOpen(open === p.productName ? null : p.productName)}>
                    <span className="kb-row__name">{p.productName}</span>
                    <span className="kb-row__meta">{p.files} documents · {p.chunks} passages{p.updatedAt ? ` · updated ${timeAgo(isoOf(p.updatedAt))}` : ''}</span>
                  </button>
                  <button className={`kb-link${confirm === p.productName ? ' is-sure' : ''}`} onClick={() => remove(p.productName)}>
                    {confirm === p.productName ? 'Really remove all?' : 'Remove product'}
                  </button>
                </div>
                {open === p.productName && (
                  <ul className="kb-docs">
                    {p.documents.map((d) => {
                      const key = `${p.productName}|${d.category}|${d.sourceFile}`
                      return (
                        <li key={key}>
                          <span className="kb-docs__cat">{d.category}</span>
                          <span className="kb-docs__file">{d.sourceFile}</span>
                          <span className="kb-docs__n">{d.chunks} passages</span>
                          <button className={`kb-link${confirm === key ? ' is-sure' : ''}`} onClick={() => remove(p.productName, d)}>{confirm === key ? 'Sure?' : 'Remove'}</button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

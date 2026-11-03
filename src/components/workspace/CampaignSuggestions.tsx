import { useCallback, useState } from 'react'
import { campaignImageUrl } from '../../api/client'
import { PosterLightbox } from './PosterLightbox'
import type { CampaignMatch, CampaignResult } from '../../types'

const STRENGTH: Record<CampaignMatch['strength'], string> = { strong: 'Strong fit', related: 'Related', 'worth discussing': 'Worth discussing' }

const when = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null)

/**
 * Campaigns suggested for this customer, shown under the suggested products. When the campaign agent found nothing that fits (or no campaign is
 * live, or it has not finished) the section is not shown at all: the page then looks exactly as it did before campaigns existed.
 */
export function CampaignSuggestions({ result }: { result: CampaignResult | null }) {
  const [open, setOpen] = useState<CampaignMatch | null>(null)
  const matches = result?.matches ?? []
  const closeViewer = useCallback(() => setOpen(null), [])
  if (matches.length === 0) return null

  return (
    <section className="camps" aria-label="Campaigns for this customer">
      <div className="camps__head">
        <h3>Campaigns for this customer</h3>
        <span>{matches.length === 1 ? 'One live campaign fits' : `${matches.length} live campaigns fit`}</span>
      </div>
      <div className="camps__cards">
        {matches.map((m) => (
          <article key={m.campaignId} className="camps__card">
            <button type="button" className="camps__poster" onClick={() => setOpen(m)} aria-label={`Open the ${m.name} poster`}>
              <img src={campaignImageUrl(m.campaignId, 'thumb')} alt={`${m.name} poster`} loading="lazy" />
            </button>
            <div className="camps__body">
              <span className={`camps__strength camps__strength--${m.strength.replace(' ', '-')}`}>{STRENGTH[m.strength]}</span>
              <h4>{m.name}</h4>
              <p>{m.reason}</p>
              <q>{m.quote}</q>
              <div className="camps__meta">
                {m.validUntil && <span>Runs until {when(m.validUntil)}</span>}
                {m.callToAction && <span>{m.callToAction}</span>}
              </div>
              <button type="button" className="camps__open" onClick={() => setOpen(m)}>Open poster</button>
            </div>
          </article>
        ))}
      </div>

      {open && <PosterLightbox campaignId={open.campaignId} name={open.name} onClose={closeViewer} />}
    </section>
  )
}

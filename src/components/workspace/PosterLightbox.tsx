import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { campaignImageUrl } from '../../api/client'

/**
 * A campaign poster, full size, over everything. It is drawn on the page body (a portal), not where it is used: the suggestion page sits inside
 * animated containers, and a fixed overlay inside a transformed container is positioned against that container instead of the window, so the poster
 * ended up off screen. Escape or a click outside closes it; the page behind does not scroll while it is open.
 */
export function PosterLightbox({ campaignId, name, version, onClose }: { campaignId: string; name: string; version?: string; onClose: () => void }) {
  const [failed, setFailed] = useState(false)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', esc)
    close.current?.focus()
    return () => {
      window.removeEventListener('keydown', esc)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className="camps__lightbox" role="dialog" aria-modal="true" aria-label={`${name} poster`} onClick={onClose}>
      <div className="camps__lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button ref={close} type="button" className="camps__close" onClick={onClose} aria-label="Close">×</button>
        {failed ? (
          <p className="camps__lightbox-error">The poster could not be loaded. If you were signed out, sign in again and reopen it.</p>
        ) : (
          <img src={campaignImageUrl(campaignId, 'main', version)} alt={`${name} poster`} onError={() => setFailed(true)} />
        )}
      </div>
    </div>,
    document.body,
  )
}

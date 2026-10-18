/**
 * The debrief ledger and the review page are different screens, but a fact should not just vanish from one and appear on the other.
 * While the ledger is on screen its chips are remembered (where they were, how they looked). When the review page appears, the facts
 * it shows fly in from where the matching chips were, then settle into place. Pure presentation: nothing here reads or changes data.
 */
interface Chip { text: string; x: number; y: number; w: number; h: number; font: string; color: string; background: string; border: string; radius: string }
let remembered: { at: number; chips: Chip[] } | null = null

const FRESH_MS = 180000
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
/** One text holds the other and most of it: "Mother" is not "Mother's heart condition", but "Son's education" is "son's education." */
const closeEnough = (a: string, b: string) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 4 && long.includes(short) && short.length / long.length >= 0.6
}

/** Remember the ledger's chips that are visible right now. */
export function rememberChips(root: HTMLElement | null) {
  if (!root) return
  const box = root.getBoundingClientRect()
  const chips: Chip[] = []
  root.querySelectorAll<HTMLElement>('.jn__chip').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.bottom < box.top || r.top > box.bottom) return
    const cs = getComputedStyle(el)
    chips.push({ text: (el.textContent ?? '').trim(), x: r.left, y: r.top, w: r.width, h: r.height, font: cs.font, color: cs.color, background: cs.backgroundColor, border: cs.border, radius: cs.borderRadius })
  })
  if (chips.length) remembered = { at: Date.now(), chips }
}

/** Fly the remembered chips into the review page's facts (the elements marked data-fly). Safe to call when there is nothing to do. */
export function flyIn(root: HTMLElement | null, reduceMotion: boolean) {
  const snap = remembered
  remembered = null
  if (!root || !snap || reduceMotion || Date.now() - snap.at > FRESH_MS || typeof document.body.animate !== 'function') return
  const used = new Set<number>()
  let order = 0
  root.querySelectorAll<HTMLElement>('[data-fly]').forEach((target) => {
    const want = norm(target.textContent)
    if (want.length < 3) return
    const i = snap.chips.findIndex((c, k) => !used.has(k) && (norm(c.text) === want || closeEnough(norm(c.text), want)))
    if (i < 0) return
    used.add(i)
    const from = snap.chips[i]
    const to = target.getBoundingClientRect()
    if (to.width === 0) return
    const delay = order++ * 70
    const ghost = document.createElement('div')
    ghost.textContent = from.text
    Object.assign(ghost.style, {
      position: 'fixed', left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px`, height: `${from.h}px`, margin: '0', zIndex: '1000', pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden',
      font: from.font, color: from.color, background: from.background, border: from.border, borderRadius: from.radius,
    })
    document.body.appendChild(ghost)
    target.style.opacity = '0'
    const dx = to.left - from.x
    const dy = to.top - from.y
    const move = ghost.animate(
      [{ transform: 'translate(0, 0)', opacity: 1 }, { transform: `translate(${dx * 0.9}px, ${dy * 0.9}px)`, opacity: 1, offset: 0.7 }, { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 }],
      { duration: 760, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
    )
    const land = target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: delay + 460, easing: 'ease-out', fill: 'both' })
    const done = () => { ghost.remove(); target.style.opacity = '' }
    land.onfinish = done
    land.oncancel = done
    move.oncancel = done
  })
}

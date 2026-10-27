import type { JunoAction } from '../components/juno/mode/JunoMode'

/**
 * "Hey Juno, click Start talking": every button on the screen as something Juno can press, without registering each one by hand.
 *
 * The page is read at the moment of the request, so the list is always what is really there. Three rules keep it safe:
 *  - what starts the analysis (Approve, Get Suggestions) is never offered: only a person's own press counts, as before. Log out has its own
 *    action that asks first, so it is left out here too;
 *  - a button whose label saves, sends, copies, removes or resets something goes into a second action that asks "Do you want me to…?" first;
 *  - Juno's own controls (the capsule) are not part of the page it can press.
 */
const NEVER = /approve|get suggestions|get recommendations|preparing|log ?out|sign ?out/i
const ASK_FIRST = /\b(delete|remove|discard|reset|clear|save|send|submit|copy|apply|update|confirm|publish|share|replace|overwrite|sign up|create|new debrief)\b/i
const MAX = 200
const CLICKABLE = 'button, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="option"], summary, a[href], input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], [tabindex="0"]'

interface Found { label: string; el: HTMLElement }

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  const st = getComputedStyle(el)
  return st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[aria-hidden="true"], [inert]')
}

/** What an icon-only control is called when it has no words: the usual meaning of its class name ("hjd-x", "panel-min"). */
const ICON_NAMES: [RegExp, string][] = [
  [/(^|[-_ ])(min|minimi[sz]e)([-_ ]|$)/i, 'Minimise'], [/(^|[-_ ])(max|maximi[sz]e|expand)([-_ ]|$)/i, 'Expand'], [/collapse/i, 'Collapse'],
  [/(^|[-_ ])(x|close|dismiss)([-_ ]|$)/i, 'Close'], [/(^|[-_ ])(back|prev|previous)([-_ ]|$)/i, 'Back'], [/(^|[-_ ])next([-_ ]|$)/i, 'Next'],
  [/(^|[-_ ])(menu|burger)([-_ ]|$)/i, 'Menu'], [/(^|[-_ ])(more|dots)([-_ ]|$)/i, 'More'], [/(^|[-_ ])(play)([-_ ]|$)/i, 'Play'], [/(^|[-_ ])pause([-_ ]|$)/i, 'Pause'],
]

function labelOf(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? '').join(' ')
  const input = el as HTMLInputElement
  let raw = el.getAttribute('aria-label') || el.innerText || (el.tagName === 'INPUT' ? input.value || input.labels?.[0]?.innerText || '' : '') || el.getAttribute('title') || labelledBy ||
    el.querySelector('img')?.getAttribute('alt') || el.querySelector('svg title')?.textContent || ''
  let label = raw.replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+\d+$/, '').trim().slice(0, 60)
  // An icon with no words at all: name it by what its class says it is, so even a small × or – can be asked for.
  if (label.length < 2) {
    const hint = `${el.className ?? ''} ${el.id ?? ''}`
    label = ICON_NAMES.find(([re]) => re.test(hint))?.[1] ?? ''
  }
  return label
}

/** Anything else that behaves like a button (a card or chip with a click handler shows the pointer cursor). Looking at every element's cursor is
 *  slow on a big page, so the elements found are kept for a few seconds; whether they are visible is checked fresh each time. */
let pointerCache: { at: number; els: HTMLElement[] } = { at: 0, els: [] }
function pointerElements(already: HTMLElement[]): HTMLElement[] {
  if (Date.now() - pointerCache.at > 4000) {
    const els: HTMLElement[] = []
    for (const el of document.querySelectorAll<HTMLElement>('div, span, li, article, label, img')) {
      if (el.closest('.jm') || el.closest(CLICKABLE) || getComputedStyle(el).cursor !== 'pointer') continue
      if ([...el.children].some((c) => getComputedStyle(c).cursor === 'pointer')) continue // the inner one is the target
      els.push(el)
    }
    pointerCache = { at: Date.now(), els }
  }
  return pointerCache.els.filter((el) => el.isConnected && !already.some((c) => c.contains(el)))
}

/** The buttons, tabs and links a person could press on the screen right now. */
export function scanButtons(): Found[] {
  const seen = new Map<string, number>()
  const out: Found[] = []
  const candidates = [...document.querySelectorAll<HTMLElement>(CLICKABLE)]
  candidates.push(...pointerElements(candidates))
  for (const el of candidates) {
    if (el.closest('.jm') || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue
    // The tab that is already open is not a thing to press: its own name then reaches the screen's own action ("Rehearse" starts the rehearsal).
    if (el.getAttribute('role') === 'tab' && el.getAttribute('aria-selected') === 'true') continue
    if (el.tagName === 'INPUT' && ['text', 'search', 'email', 'password', 'number', 'tel', 'url'].includes((el as HTMLInputElement).type)) continue
    let label = labelOf(el)
    if (label.length < 2 || NEVER.test(label) || !visible(el)) continue
    // Two buttons with the same words ("Why this?" on each suggestion) are told apart by their order: "Why this?", "Why this? 2".
    const base = label.toLowerCase()
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    if (n > 1) label = `${label} ${n}`
    out.push({ label, el })
    if (out.length >= MAX) break
  }
  return out
}

function press(label: string): string | void {
  const hit = scanButtons().find((b) => b.label.toLowerCase() === label.toLowerCase())
  if (!hit) return 'I can’t see that button any more.'
  hit.el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  hit.el.click()
}

export function pageButtonActions(): JunoAction[] {
  const found = scanButtons()
  const easy = found.filter((b) => !ASK_FIRST.test(b.label))
  const careful = found.filter((b) => ASK_FIRST.test(b.label))
  const out: JunoAction[] = []
  if (easy.length) {
    out.push({ id: 'press_button', description: 'Press a button or tab that is on the screen', risk: 'open', params: { button: { type: 'enum', values: easy.map((b) => b.label) } }, run: (p) => press(p.button) })
  }
  if (careful.length) {
    out.push({ id: 'press_button_confirm', description: 'Press a button that saves, sends, copies, removes or resets something', risk: 'change', params: { button: { type: 'enum', values: careful.map((b) => b.label) } }, run: (p) => press(p.button) })
  }
  return out
}

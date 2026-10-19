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
const MAX = 40

interface Found { label: string; el: HTMLElement }

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  const st = getComputedStyle(el)
  return st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[aria-hidden="true"], [inert]')
}

function labelOf(el: HTMLElement): string {
  const raw = el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || ''
  return raw.replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+\d+$/, '').trim().slice(0, 60)
}

/** The buttons, tabs and links a person could press on the screen right now. */
export function scanButtons(): Found[] {
  const seen = new Set<string>()
  const out: Found[] = []
  for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], summary, a[href]')) {
    if (el.closest('.jm') || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue
    const label = labelOf(el)
    if (label.length < 2 || NEVER.test(label) || !visible(el)) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
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

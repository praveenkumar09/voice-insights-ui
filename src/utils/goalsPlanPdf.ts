import type { ProtectionStory } from '../types'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** One-page "Goals and plan" to leave with the customer (browser print → Save as PDF). Deliberately has no figures. */
export function printGoalsPlan(story: ProtectionStory, customerName?: string | null) {
  const goals = story.goals ?? []
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Goals and plan</title>
<style>
  @page{margin:18mm 16mm}
  body{font:14px/1.6 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14161f;margin:0}
  .bar{height:6px;background:linear-gradient(90deg,#d31145,#9c0c34);border-radius:3px;margin-bottom:20px}
  .kicker{color:#d31145;font-weight:800;letter-spacing:.12em;font-size:11px;text-transform:uppercase}
  h1{font-size:26px;line-height:1.25;margin:8px 0 10px;letter-spacing:-.02em}
  .open{color:#444;font-size:15px}
  h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#d31145;margin:26px 0 8px}
  blockquote{margin:8px 0;padding:10px 16px;border-left:4px solid #d31145;background:#fdf1f5;font-size:16px;font-style:italic;border-radius:0 10px 10px 0}
  blockquote small{display:block;font-style:normal;color:#999;font-size:11px;margin-top:2px;text-transform:uppercase;letter-spacing:.06em}
  .goal{border:1px solid #e8e8ec;border-radius:12px;padding:14px 18px;margin:0 0 12px;page-break-inside:avoid}
  .goal h2{font-size:16px;margin:0 0 2px}
  .goal .for{color:#888;font-size:12px;margin-bottom:6px}
  .goal .prods{margin-top:8px}
  .goal .prods span{display:inline-block;font-size:12px;font-weight:600;color:#d31145;background:#fdeaf0;padding:2px 10px;border-radius:99px;margin-right:6px}
  .disc{margin-top:26px;font-size:11px;color:#777;border-top:1px solid #eee;padding-top:10px}
</style></head><body>
<div class="bar"></div>
<div class="kicker">AIA Singapore · Goals and plan${customerName ? ` · ${esc(customerName)}` : ''}</div>
<h1>${esc(story.headline)}</h1>
<p class="open">${esc(story.opening)}</p>
${story.quotes.length ? `<h3>What you told us</h3>${story.quotes.map((q) => `<blockquote>“${esc(q.text)}”<small>${esc(q.theme)}</small></blockquote>`).join('')}` : ''}
${goals.length ? `<h3>How we can help</h3>${goals
    .map(
      (g) => `<div class="goal"><h2>${esc(g.label)}</h2>${g.forRelation && g.forRelation !== 'Self' ? `<div class="for">For ${esc(g.forRelation.toLowerCase())}</div>` : ''}
<div>${esc(g.support)}</div>${g.products.length ? `<div class="prods">${g.products.map((p) => `<span>${esc(p)}</span>`).join('')}</div>` : ''}</div>`,
    )
    .join('')}` : ''}
<p style="margin-top:18px">${esc(story.closing)}</p>
<div class="disc">This summary reflects what you shared with your advisor. Product features are described from AIA product documents and are subject to the policy terms, conditions and underwriting. It is not a contract or a guarantee of any outcome.</div>
</body></html>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 60000)
  }, 300)
}

import { relevanceLabel } from './relevance'
import type { ProposalResult } from '../types'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

const LABELS = {
  en: { why: 'Why we suggest it', benefits: 'Key benefits', premium: 'Indicative premium', next: 'Suggested next steps', source: 'Source' },
  zh: { why: '我们为什么建议它', benefits: '主要保障', premium: '参考保费', next: '建议的下一步', source: '来源' },
  ta: { why: 'நாங்கள் ஏன் இதை யோசனையாகக் கூறுகிறோம்', benefits: 'முக்கிய நன்மைகள்', premium: 'குறிப்பீட்டு பிரீமியம்', next: 'முன்மொழியப்படும் அடுத்த படிகள்', source: 'ஆதாரம்' },
  ms: { why: 'Mengapa kami mencadangkannya', benefits: 'Manfaat utama', premium: 'Premium indikatif', next: 'Langkah seterusnya yang dicadangkan', source: 'Sumber' },
} as const

/** Opens the browser print dialog ("Save as PDF") on a branded, customer-ready proposal. */
export function printProposal(p: ProposalResult, customerName?: string | null) {
  const L = LABELS[p.language] ?? LABELS.en
  const html = `<!doctype html><html lang="${p.language}"><head><meta charset="utf-8"><title>${esc(p.title)}</title>
<style>
  @page{margin:18mm 16mm}
  body{font:13.5px/1.6 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei','Tamil Sangam MN','Nirmala UI','Latha',Helvetica,Arial,sans-serif;color:#14161f;margin:0}
  .bar{height:6px;background:linear-gradient(90deg,#d31145,#9c0c34);border-radius:3px;margin-bottom:22px}
  .brand{display:flex;justify-content:space-between;align-items:baseline;color:#d31145;font-weight:800;letter-spacing:.04em;font-size:12px;text-transform:uppercase}
  h1{font-size:26px;margin:10px 0 4px;letter-spacing:-.02em}
  .greet{color:#444;margin:0 0 16px}
  .summary{background:#fdf1f5;border-left:4px solid #d31145;padding:12px 16px;border-radius:0 10px 10px 0;margin:0 0 22px}
  .prod{border:1px solid #e8e8ec;border-radius:12px;padding:16px 18px;margin:0 0 14px;page-break-inside:avoid}
  .prod h2{font-size:16px;margin:0;display:flex;justify-content:space-between;align-items:baseline}
  .fit{font-size:12px;font-weight:700;color:#d31145;background:#fdeaf0;padding:2px 10px;border-radius:99px}
  .lab{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#888;margin:10px 0 3px}
  ul{margin:2px 0 0;padding-left:18px} li{margin:2px 0}
  .prem{font-weight:600}
  .src{color:#999;font-size:11px;margin-top:8px}
  h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#d31145;margin:24px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
  .disc{margin-top:26px;font-size:11px;color:#777;border-top:1px solid #eee;padding-top:10px}
</style></head><body>
<div class="bar"></div>
<div class="brand"><span>AIA Singapore</span><span>${esc(new Date().toLocaleDateString())}</span></div>
<h1>${esc(p.title)}</h1>
${customerName ? `<p class="greet"><b>${esc(customerName)}</b></p>` : ''}
<p class="greet">${esc(p.greeting)}</p>
<div class="summary">${esc(p.summary)}</div>
${p.products
  .map(
    (pr, i) => `<div class="prod"><h2><span>${i + 1}. ${esc(pr.name)}</span><span class="fit">${relevanceLabel(pr.fitScore, p.language)}</span></h2>
<div class="lab">${L.why}</div><div>${esc(pr.whyItFits)}</div>
${pr.keyBenefits.length ? `<div class="lab">${L.benefits}</div><ul>${pr.keyBenefits.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
<div class="lab">${L.premium}</div><div class="prem">${esc(pr.indicativePremium)}</div>
${pr.source ? `<div class="src">${L.source}: ${esc(pr.source)}</div>` : ''}</div>`,
  )
  .join('')}
<h3>${L.next}</h3><ul>${p.nextSteps.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
<div class="disc">${esc(p.disclaimer)}</div>
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

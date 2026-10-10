import type { AskTurn } from '../api/client'
import { chipLabel, chipLabels } from './askSources'
import { relevanceLabel } from './relevance'
import type { AdvicePack } from '../types'
import { AGENT_NAME } from '../brand'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const nl = (s: unknown) => esc(s).replace(/\n/g, '<br>')

const SOURCE: Record<string, string> = { customer: 'Customer said', profile: 'From conversation', advisor: 'Added by advisor', missing: 'Not mentioned' }

/** Opens the print dialog ("Save as PDF") on the whole advice pack: fact-find, record of advice, follow-up, CRM, next meeting. */
export function printAdvicePack(pack: AdvicePack, customerName?: string | null, discussion: AskTurn[] = []) {
  const talk = discussion.length
    ? discussion
        .map((t) => {
          const labels = chipLabels(Object.values(t.sources ?? {}))
          const src = Object.values(t.sources ?? {}).map((s) => labels.get(s.id) ?? chipLabel(s))
          return `<div class="card"><div class="lab">The advisor asked</div><div>${nl(t.question)}</div><div class="lab">Juno answered</div><div>${nl(t.answer)}</div>${src.length ? `<div class="muted">Sources: ${esc(src.join(' · '))}</div>` : ''}</div>`
        })
        .join('')
    : '<p class="muted">The advisor did not discuss the suggestions with Juno.</p>'
  const reviewed = pack.review
    ? `Reviewed by ${esc(pack.review.reviewedBy)} on ${esc(new Date(pack.review.reviewedAt).toLocaleString())}`
    : 'DRAFT — not yet reviewed by the advisor'

  const factFind = (pack.factFind ?? [])
    .map(
      (s) => `<h3>${esc(s.title)}</h3><table>${s.fields
        .map(
          (f) => `<tr class="${f.source === 'missing' ? 'miss' : ''}"><td class="k">${esc(f.label)}</td>
<td>${f.source === 'missing' ? '<i>Not mentioned — ask at next meeting</i>' : nl(f.value)}${f.quote ? `<div class="q">“${esc(f.quote)}”</div>` : ''}</td>
<td class="s">${SOURCE[f.source] ?? ''}</td></tr>`,
        )
        .join('')}</table>`,
    )
    .join('')

  const r = pack.recordOfAdvice
  const record = r
    ? `<p>${nl(r.needsSummary)}</p>${r.items
        .map(
          (i, n) => `<div class="card"><h4>${n + 1}. ${esc(i.productName)} <span class="fit">${relevanceLabel(i.fitScore)}</span></h4>
<div class="lab">Customer need</div><div>${nl(i.need)}</div>
<div class="lab">Why we suggest it</div><div>${nl(i.rationale)}</div>
${i.customerQuotes.length ? `<div class="lab">In the customer’s words</div>${i.customerQuotes.map((q) => `<div class="q">“${esc(q)}”</div>`).join('')}` : ''}
<div class="lab">Existing cover</div><div>${nl(i.existingCoverNote)}</div>
${i.risksToDisclose.length ? `<div class="lab">Risks and points to disclose</div><ul>${i.risksToDisclose.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${i.evidence.length ? `<div class="lab">Product document evidence</div><ul>${i.evidence.map((e) => `<li>${esc(e.excerpt)} <span class="src">[${esc(e.source)}]</span></li>`).join('')}</ul>` : ''}</div>`,
        )
        .join('')}
${r.checks.length ? `<h4>Compliance checks</h4><ul>${r.checks.map((c) => `<li>${c.passed ? '✔' : '✘'} <b>${esc(c.check)}</b> — ${esc(c.note)}</li>`).join('')}</ul>` : ''}
${r.conductFlags.length ? `<h4>Conduct flags raised during the conversation</h4><ul>${r.conductFlags.map((f) => `<li><b>${esc(f.severity)}</b>: “${esc(f.statement)}” — ${esc(f.advice)}</li>`).join('')}</ul>` : ''}
<div class="disc">${r.disclosures.map((d) => `<div>• ${esc(d)}</div>`).join('')}</div>`
    : '<p><i>Not generated.</i></p>'

  const fu = pack.followUp
  const follow = fu
    ? `<h4>WhatsApp</h4><div class="box">${nl(fu.whatsapp)}</div><h4>Email</h4><div class="box"><b>${esc(fu.emailSubject)}</b><br><br>${nl(fu.emailBody)}</div>`
    : '<p><i>Not generated.</i></p>'

  const crm = pack.crm
  const crmHtml = crm
    ? `<h4>Case note</h4><div class="box">${nl(crm.caseNote)}</div><h4>Follow-up tasks</h4><table>${crm.tasks
        .map((t) => `<tr><td class="k">${t.done ? '☑' : '☐'} ${esc(t.title)}</td><td>${esc(t.reason)}</td><td class="s">${esc(t.priority)} · due ${esc(t.dueDate)}</td></tr>`)
        .join('')}</table>`
    : '<p><i>Not generated.</i></p>'

  const nm = pack.nextMeeting
  const meeting = nm
    ? `<p><b>Objective:</b> ${esc(nm.objective)}</p>
${nm.gapsToFill.length ? `<h4>Information still missing</h4><ul>${nm.gapsToFill.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
<h4>Questions to ask</h4><ol>${nm.questionsToAsk.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
<h4>Likely objections</h4><table>${nm.likelyObjections.map((o) => `<tr><td class="k">${esc(o.objection)}</td><td>${esc(o.response)}</td></tr>`).join('')}</table>
<h4>Talking points</h4><ul>${nm.talkingPoints.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '<p><i>Not generated.</i></p>'

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Advice pack — ${esc(customerName ?? 'customer')}</title>
<style>
  @page{margin:16mm 14mm}
  body{font:12.5px/1.55 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14161f;margin:0}
  .bar{height:6px;background:linear-gradient(90deg,#d31145,#9c0c34);border-radius:3px;margin-bottom:18px}
  .brand{display:flex;justify-content:space-between;color:#d31145;font-weight:800;letter-spacing:.04em;font-size:11px;text-transform:uppercase}
  h1{font-size:24px;margin:8px 0 2px;letter-spacing:-.02em}
  .stamp{display:inline-block;margin:6px 0 4px;font-size:11px;font-weight:700;padding:3px 12px;border-radius:99px;background:${pack.review ? '#e3f6ee' : '#fdf1e0'};color:${pack.review ? '#0f7a55' : '#9a6a12'}}
  h2{font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#d31145;margin:26px 0 8px;border-bottom:2px solid #f3c9d5;padding-bottom:4px;page-break-after:avoid}
  h3{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#555;margin:14px 0 4px}
  h4{font-size:13px;margin:14px 0 4px}
  table{width:100%;border-collapse:collapse} td{border-bottom:1px solid #eee;padding:5px 8px;vertical-align:top}
  td.k{width:30%;font-weight:600;color:#333} td.s{width:16%;font-size:10.5px;color:#888;text-align:right}
  tr.miss td{background:#fff8ec}
  .q{font-style:italic;color:#666;font-size:11.5px;margin-top:2px}
  .card{border:1px solid #e8e8ec;border-radius:10px;padding:12px 14px;margin:10px 0;page-break-inside:avoid}
  .card h4{margin:0 0 4px;display:flex;justify-content:space-between}
  .fit{font-size:11px;font-weight:700;color:#d31145;background:#fdeaf0;padding:1px 9px;border-radius:99px}
  .lab{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#888;margin:8px 0 2px}
  .box{background:#f7f7f9;border-radius:8px;padding:10px 14px}
  .src{color:#999;font-size:10.5px} ul,ol{margin:2px 0;padding-left:20px}
  .disc{margin-top:12px;font-size:10.5px;color:#777;border-top:1px solid #eee;padding-top:8px}
</style></head><body>
<div class="bar"></div>
<div class="brand"><span>AIA Singapore · Advice pack · prepared with ${AGENT_NAME}</span><span>${esc(new Date().toLocaleDateString())}</span></div>
<h1>${esc(customerName ?? 'Customer')}</h1>
<div class="stamp">${reviewed}</div>
<h2>1 · Fact-find</h2>${factFind || '<p><i>Not generated.</i></p>'}
<h2>2 · Record of advice</h2>${record}
<h2>3 · Customer follow-up</h2>${follow}
<h2>4 · CRM note and tasks</h2>${crmHtml}
<h2>5 · Next-meeting brief</h2>${meeting}
<h2>6 · Discussion with Juno <small>(internal — the advisor questioning the suggestions)</small></h2>
<p class="muted">Juno answered from this customer’s file and the product documents. It suggests; the advisor decides.</p>${talk}
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

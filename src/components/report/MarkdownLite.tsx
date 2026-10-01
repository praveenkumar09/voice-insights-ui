import type { ReactNode } from 'react'

/** Inline **bold** and *italic* → React nodes. Everything else is rendered as plain text (no HTML injection). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    out.push(tok.startsWith('**') ? <strong key={i++}>{tok.slice(2, -2)}</strong> : <em key={i++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * The advisory report is generated as Markdown (and also downloadable as
 * such). This renders the subset it uses — headings, bullets, numbered items,
 * bold/italic — as a readable on-screen document, grouped into titled
 * sections, without pulling in a Markdown dependency.
 */
export function MarkdownLite({ source }: { source: string }) {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let title: string | null = null
  let section: { heading: string; nodes: ReactNode[] } | null = null
  let list: { indent: number; text: string; num: string | null }[] = []
  let key = 0

  const target = () => (section ? section.nodes : blocks)

  const flushList = () => {
    if (!list.length) return
    const items = list
    list = []
    target().push(
      <ul className="md__list" key={key++}>
        {items.map((it, i) => (
          <li key={i} className={`md__li${it.indent > 0 ? ' md__li--nested' : ''}${it.num ? ' md__li--ordered' : ''}`}>
            {it.num && <span className="md__num">{it.num}.</span>}
            {inline(it.text)}
          </li>
        ))}
      </ul>,
    )
  }
  const flushSection = () => {
    flushList()
    if (section) {
      blocks.push(
        <section className="md__section" key={key++}>
          <h4>{section.heading}</h4>
          {section.nodes}
        </section>,
      )
      section = null
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      flushList()
      continue
    }
    if (line.startsWith('# ')) {
      title = line.slice(2)
      continue
    }
    if (line.startsWith('## ')) {
      flushSection()
      section = { heading: line.slice(3), nodes: [] }
      continue
    }
    const bullet = line.match(/^(\s*)(?:[-•]|(\d+)\.)\s+(.*)$/)
    if (bullet) {
      list.push({ indent: bullet[1].length, text: bullet[3], num: bullet[2] ?? null })
      continue
    }
    flushList()
    target().push(
      <p className="md__p" key={key++}>
        {inline(line.trim())}
      </p>,
    )
  }
  flushSection()

  return (
    <div className="md">
      {title && <h3 className="md__title">{title}</h3>}
      {blocks}
    </div>
  )
}

// Counts the words in a text that may be English, Chinese or a mix. Splitting on spaces counts a whole Chinese
// sentence as one word, so the browser's own word segmenter is used (it knows where Chinese words end); where it is
// missing, every Chinese character counts as a word, which is close enough for a running total.
type Segment = { isWordLike?: boolean }
type SegmenterCtor = new (locale?: string, options?: { granularity: 'word' }) => { segment(text: string): Iterable<Segment> }

const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter
const segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'word' }) : null

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu

export function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  if (segmenter) {
    let n = 0
    for (const s of segmenter.segment(t)) if (s.isWordLike) n++
    return n
  }
  const cjk = (t.match(CJK) ?? []).length
  const rest = t.replace(CJK, ' ').split(/\s+/).filter(Boolean).length
  return cjk + rest
}

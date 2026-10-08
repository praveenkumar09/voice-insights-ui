// How strongly a product is suggested, in words. The underlying 0-100 score still orders the list, but it is never
// shown: a percentage reads as a precise measure of suitability, which a suggestion is not.
export type RelevanceBand = 'high' | 'medium' | 'low'
export type RelevanceLang = 'en' | 'zh' | 'ms' | 'ta'

const HIGH = 75
const MEDIUM = 55

const LABELS: Record<RelevanceLang, Record<RelevanceBand, string>> = {
  en: { high: 'Highly relevant', medium: 'Relevant', low: 'Worth discussing' },
  zh: { high: '高度相关', medium: '相关', low: '值得讨论' },
  ms: { high: 'Sangat relevan', medium: 'Relevan', low: 'Wajar dibincangkan' },
  ta: { high: 'மிகவும் தொடர்புடையது', medium: 'தொடர்புடையது', low: 'விவாதிக்கத் தகுந்தது' },
}

export function relevanceBand(score: number): RelevanceBand {
  return score >= HIGH ? 'high' : score >= MEDIUM ? 'medium' : 'low'
}

export function relevanceLabel(score: number, lang: string = 'en'): string {
  const l = (lang in LABELS ? lang : 'en') as RelevanceLang
  return LABELS[l][relevanceBand(score)]
}

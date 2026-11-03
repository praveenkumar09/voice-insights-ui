import type { LangId } from '../api/client'
import { tenant, useTenant } from './tenant'

/**
 * Everything the screens need to know about the languages Spark works in, in one place. The server has the matching registry
 * (Languages.java); a language is added in both, plus its fixed lines (JunoPhrases.java) and its wording rules.
 */
export interface LanguageInfo {
  id: LangId
  /** The short label on the language selector. */
  label: string
  /** English name, for tooltips and spoken confirmations. */
  name: string
  /** How the language names itself, for lists where there is room. */
  native: string
  /** The browser's speech-synthesis tag, for the fallback voice. */
  speech: string
  /** No spaces between words: captions light up a character (cluster) at a time, and sentence-length rules count characters. */
  spaceless: boolean
}

export const LANGUAGE_INFO: LanguageInfo[] = [
  { id: 'en', label: 'EN', name: 'English', native: 'English', speech: 'en-GB', spaceless: false },
  { id: 'zh', label: '中文', name: 'Chinese', native: '中文', speech: 'zh-CN', spaceless: true },
  { id: 'ms', label: 'BM', name: 'Bahasa Melayu', native: 'Bahasa Melayu', speech: 'ms-MY', spaceless: false },
  { id: 'ta', label: 'தமிழ்', name: 'Tamil', native: 'தமிழ்', speech: 'ta-IN', spaceless: false },
  { id: 'th', label: 'ไทย', name: 'Thai', native: 'ไทย', speech: 'th-TH', spaceless: true },
  { id: 'fil', label: 'FIL', name: 'Filipino', native: 'Filipino', speech: 'fil-PH', spaceless: false },
  { id: 'vi', label: 'VI', name: 'Vietnamese', native: 'Tiếng Việt', speech: 'vi-VN', spaceless: false },
]

export const infoOf = (l: LangId): LanguageInfo => LANGUAGE_INFO.find((x) => x.id === l) ?? LANGUAGE_INFO[0]
export const isSpaceless = (l: LangId) => infoOf(l).spaceless
/** The languages an admin has turned on for this business unit, in the usual order. */
export const enabledLanguages = (): LanguageInfo[] => {
  const on = tenant().languages
  const list = LANGUAGE_INFO.filter((l) => on.includes(l.id))
  return list.length ? list : [LANGUAGE_INFO[0]]
}
/** The same, for components: they redraw when an admin changes the setting. */
export const useEnabledLanguages = (): LanguageInfo[] => { useTenant(); return enabledLanguages() }
/** "English, 中文, Bahasa Melayu, தமிழ், ไทย, Filipino, Tiếng Việt" (the ones that are on) */
export const nativeList = () => enabledLanguages().map((l) => l.native).join(', ')
/** "English, 中文 and Bahasa Melayu" (the ones that are on) */
export const nativeSentenceList = () => {
  const n = enabledLanguages().map((l) => l.native)
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

const VIETNAMESE_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i

/** The language of a line, from its script. Filipino is written in Latin letters like English, so it cannot be told apart this way. */
export function detectLang(text: string): LangId {
  if (/[一-鿿]/.test(text)) return 'zh'
  if (/[஀-௿]/.test(text)) return 'ta'
  if (/[฀-๿]/.test(text)) return 'th'
  if (VIETNAMESE_LETTERS.test(text)) return 'vi'
  return 'en'
}

/** Text as separate pieces to reveal one by one: characters (grapheme clusters, so Thai vowel marks stay on their letters) or words. */
export function revealPieces(text: string, lang: LangId): string[] {
  if (!isSpaceless(lang)) return text.split(/(\s+)/)
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter
  return Seg ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment) : Array.from(text)
}

/**
 * Thai marks the speaker's gender on its polite particles (ค่ะ / คะ for a woman, ครับ for a man) and the first-person word. The fixed lines
 * are written with the female forms; when Spark's voice is the male one they are switched so the words and the voice agree.
 */
export function thaiForVoice(text: string, male: boolean): string {
  if (male) return text.replace(/ค่ะ/g, 'ครับ').replace(/คะ(?![฀-๿])/g, 'ครับ').replace(/ดิฉัน/g, 'ผม')
  // The female voice: a model writing Spark's lines may still end with ครับ. A question takes คะ, a statement ค่ะ, and a softener นะ takes คะ.
  const question = /(ไหม|หรือไม่|หรือเปล่า|เหรอ|อะไร|ไหน|ไหร่|เท่าไร|ใคร|ทำไม|อย่างไร|ยังไง|บ้าง|กี่[฀-๿]*|เมื่อไร)\s*ครับ/g
  return text
    .replace(question, (m) => m.replace('ครับ', 'คะ'))
    .replace(/นะครับ/g, 'นะคะ')
    .replace(/ครับ(?=\s*\?)/g, 'คะ')
    .replace(/ครับ/g, 'ค่ะ')
    .replace(/ผม(?=\s|$|ขอ|จะ|ได้|ยัง|เข้าใจ|ช่วย|พร้อม|ไม่|มี|คิด|สรุป|อยาก|เป็น|ฟัง|จด|บันทึก|ถาม|ต้อง)/g, 'ดิฉัน')
}

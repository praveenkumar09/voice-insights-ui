/**
 * The quick-answer buttons under Spark's question. Spark's line usually restates the facts first ("earning about $9,000 a month ...") and
 * only then asks, so the buttons are chosen from the QUESTION, not from the whole line: "Per month / Per year" when the question is about an
 * amount over time, "Yes / No" otherwise.
 */

/** The last question in a line (a sentence ending in ? or ？), or the last sentence when it has none. */
export function lastQuestion(line: string): string {
  const text = line.trim()
  const asked = text.match(/[^.!?？。！]*[?？]\s*$/)
  const picked = asked ? asked[0].trim() : (text.split(/(?<=[.!。！])\s+/).filter(Boolean).pop() ?? text)
  // Thai has no full stops: its sentences end in a polite particle (ค่ะ, คะ, ครับ) followed by a space.
  return /[฀-๿]/.test(picked) ? (picked.split(/(?<=ค่ะ|คะ|ครับ)\s+/).pop() ?? picked) : picked
}

// month / year in the languages Spark speaks (word forms; Thai, Chinese and Vietnamese have no spaces or short forms)
const PERIOD = /(\bmonth|\byear|monthly|yearly|annual|\bbulan|\btahun|\bbuwan|\btaon|\bthang\b|\btháng|\bnăm\b|月|年|เดือน|ปี|மாதம்|வருடம்)/i

/** Whether the question asks for an amount per month or per year. */
export function asksForPeriod(line: string): boolean {
  return PERIOD.test(lastQuestion(line))
}

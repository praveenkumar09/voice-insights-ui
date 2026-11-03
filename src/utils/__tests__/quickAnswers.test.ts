import { describe, expect, it } from 'vitest'
import { asksForPeriod, lastQuestion } from '../quickAnswers'

describe('quick answers follow the question, not the whole line', () => {
  it('a smoker question after a summary that mentions "a month" is yes/no', () => {
    const line = 'Marcus is 38, a senior civil engineer earning about $9,000 a month, with a $400,000 housing loan. Could you let me know if Marcus is a smoker or non-smoker?'
    expect(lastQuestion(line)).toBe('Could you let me know if Marcus is a smoker or non-smoker?')
    expect(asksForPeriod(line)).toBe(false)
  })
  it('a question about an amount over time offers per month / per year', () => {
    expect(asksForPeriod('Thanks. Roughly how much does the family spend each month on living expenses?')).toBe(true)
    expect(asksForPeriod('Is the budget of $500 per year or per month?')).toBe(true)
  })
  it('works in the other languages', () => {
    expect(asksForPeriod('Cảm ơn. Gia đình chi tiêu khoảng bao nhiêu mỗi tháng?')).toBe(true)
    expect(asksForPeriod('Mga magkano po ang gastos nila kada buwan?')).toBe(true)
    expect(asksForPeriod('ขอบคุณค่ะ ครอบครัวมีค่าใช้จ่ายประมาณเท่าไหร่ต่อเดือนคะ?')).toBe(true)
    expect(asksForPeriod('ลูกค้ารายได้ประมาณ 90,000 บาทต่อเดือน ใช่ไหมคะ สูบบุหรี่หรือไม่คะ?')).toBe(false)
    expect(asksForPeriod('Anh ấy thu nhập 35 triệu mỗi tháng. Anh ấy có hút thuốc không ạ?')).toBe(false)
  })
  it('a line without a question uses its last sentence', () => {
    expect(lastQuestion('Thanks. Got it.')).toBe('Got it.')
  })
})

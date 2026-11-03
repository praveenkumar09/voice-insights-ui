import { describe, expect, it } from 'vitest'
import { thaiForVoice } from '../languages'
import { money, setTenant } from '../tenant'

describe('Thai particles follow Spark\'s voice', () => {
  it('female voice: statement ค่ะ, question คะ, softener นะคะ', () => {
    expect(thaiForVoice('ขอบคุณครับ', false)).toBe('ขอบคุณค่ะ')
    expect(thaiForVoice('คุณสมชายสูบบุหรี่หรือไม่ครับ?', false)).toBe('คุณสมชายสูบบุหรี่หรือไม่คะ?')
    expect(thaiForVoice('คุ้มครองอะไรบ้างและทุนประกันเท่าไหร่ครับ?', false)).toBe('คุ้มครองอะไรบ้างและทุนประกันเท่าไหร่คะ?')
    expect(thaiForVoice('รับทราบแล้วนะครับ', false)).toBe('รับทราบแล้วนะคะ')
    expect(thaiForVoice('ผมขอสรุปนะครับ', false)).toBe('ดิฉันขอสรุปนะคะ')
  })
  it('male voice: ครับ and ผม', () => {
    expect(thaiForVoice('ขอบคุณค่ะ', true)).toBe('ขอบคุณครับ')
    expect(thaiForVoice('ดิฉันขอสรุปค่ะ', true)).toBe('ผมขอสรุปครับ')
  })
  it('already-correct female lines are unchanged', () => {
    expect(thaiForVoice('ขอบคุณค่ะ ใช่ไหมคะ?', false)).toBe('ขอบคุณค่ะ ใช่ไหมคะ?')
  })
})

describe('money', () => {
  it('Singapore and unknown currency (old records) are S$; others use the code', () => {
    expect(money(100000)).toBe('S$100,000')
    expect(money(100000, null)).toBe('S$100,000')
    expect(money(2600000, 'THB')).toBe('THB 2,600,000')
    setTenant({ businessUnit: 'th', unit: { id: 'th', name: 'AIA Thailand', country: 'Thailand', currency: 'THB', symbol: '฿', perSgd: 26, incomeExample: '', budgetExample: '', defaultLanguages: ['en', 'th'] }, languages: ['en', 'th'], updatedAt: null, units: [], available: [], minLanguages: 1 })
    expect(money(2600000, 'THB')).toBe('THB 2,600,000')
  })
})

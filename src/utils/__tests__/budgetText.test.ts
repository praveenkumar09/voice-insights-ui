import { describe, expect, it } from 'vitest'
import { budgetDisplay } from '../budgetText'

describe('the budget under the "Budget" label', () => {
  it('does not leave a sentence that starts in the middle', () => {
    expect(budgetDisplay('Budget for insurance is about THB 8,000 per month')).toBe('About THB 8,000 per month, for insurance')
    expect(budgetDisplay('Budget for protection is around PHP 5,000 per month.')).toBe('Around PHP 5,000 per month, for protection')
  })
  it('drops a plain leading "Budget is" / "Budget of"', () => {
    expect(budgetDisplay('Budget is around $500 a month.')).toBe('around $500 a month')
    expect(budgetDisplay('budget of S$400 a month')).toBe('S$400 a month')
  })
  it('leaves other text alone and copes with nothing', () => {
    expect(budgetDisplay('About $500/month')).toBe('About $500/month')
    expect(budgetDisplay(null)).toBe('')
    expect(budgetDisplay(undefined)).toBe('')
  })
})

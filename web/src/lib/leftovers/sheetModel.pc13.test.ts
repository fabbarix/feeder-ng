// B9-45 (PC-13): the Freeze sheet's words: one question, the Recipe and what is left, the default and where the others go, the button.
import { describe, expect, it } from 'vitest'
import { freezeContext, freezeHint, freezeLabel, freezeQuestion } from './sheetModel'

describe('Freeze sheet words', () => {
  it('asks one question', () => {
    expect(freezeQuestion).toBe('How many portions to freeze?')
  })
  it('the context line names the Recipe and what is left', () => {
    expect(freezeContext('Cauliflower al gorgonzola with chestnut mushrooms', 1.25)).toBe('Cauliflower al gorgonzola with chestnut mushrooms · 1.25 left')
    expect(freezeContext('Chilli', 3)).toBe('Chilli · 3 left')
  })
  it('the hint says all of it when none is planned', () => {
    expect(freezeHint(1.25, 0, [])).toBe('All of it. None of it is planned.')
  })
  it('the hint says how much of the whole is the default and where the rest is planned', () => {
    expect(freezeHint(2.5, 1.25, ['Mon Dinner'])).toBe('1.25 of 2.5. The rest is planned for Mon Dinner.')
    expect(freezeHint(4, 1, ['Mon Dinner', 'Tue Lunch'])).toBe('3 of 4. The rest is planned for Mon Dinner and Tue Lunch.')
  })
  it('the hint without meal names still says the rest is planned', () => {
    expect(freezeHint(2.5, 1.25, [])).toBe('1.25 of 2.5. The rest is planned.')
  })
  it('the hint when every portion is planned', () => {
    expect(freezeHint(2, 2, ['Mon Dinner'])).toBe('All of it is planned for Mon Dinner.')
    expect(freezeHint(2, 3, [])).toBe('All of it is planned.')
  })
  it('the primary button follows the stepper', () => {
    expect(freezeLabel(1.25)).toBe('Freeze 1.25 portions')
    expect(freezeLabel(1)).toBe('Freeze 1 portion')
    expect(freezeLabel(0.25)).toBe('Freeze 0.25 portions')
  })
})

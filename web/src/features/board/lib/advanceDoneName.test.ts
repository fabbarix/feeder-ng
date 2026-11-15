// B9-47, ruling 5 (P38: every button on a page has its own accessible name): the board's Done is "Done: <Step text>". When two Advance
// Steps shown together read the same on different meals, each name adds its meal, so the two buttons differ.
import { describe, expect, it } from 'vitest'
import type { NextAdvance } from '../types'
import { advanceDoneName } from './tiles'

const step = (over: Partial<NextAdvance> = {}): NextAdvance => ({
  scope: 'meal:2026-11-10/3', recipeName: 'Chickpea curry', step: 0, text: 'Soak the chickpeas', leadTimeMinutes: 720, dueAt: '2026-11-09T19:00:00Z',
  overdue: false, mealDate: '2026-11-10', mealSlotId: 3, slotName: 'Dinner', ...over,
})

describe('advanceDoneName', () => {
  it('one Step: "Done: <Step text>"', () => {
    const only = step()
    expect(advanceDoneName(only)).toBe('Done: Soak the chickpeas')
    expect(advanceDoneName(only, [only])).toBe('Done: Soak the chickpeas')
  })
  it('two Steps with the same text on different meals: each name adds its meal, and the names differ', () => {
    const tue = step()
    const wed = step({ scope: 'meal:2026-11-11/2', mealDate: '2026-11-11', mealSlotId: 2, slotName: 'Lunch', recipeName: 'Hummus' })
    const names = [advanceDoneName(tue, [tue, wed]), advanceDoneName(wed, [tue, wed])]
    expect(names).toEqual(['Done: Soak the chickpeas, Tue Dinner', 'Done: Soak the chickpeas, Wed Lunch'])
    expect(new Set(names).size).toBe(2)
  })
  it('two different Steps keep the short names', () => {
    const a = step()
    const b = step({ text: 'Make the dough', mealSlotId: 2 })
    expect([advanceDoneName(a, [a, b]), advanceDoneName(b, [a, b])]).toEqual(['Done: Soak the chickpeas', 'Done: Make the dough'])
  })
})

// B5-BOW: the Regenerate confirm lists the Bought Planned Meals after the count.
import { describe, expect, it } from 'vitest'
import type { RegenerateDryRun } from './bought'
import { regenerateConfirmCopy } from './regenerate'

// 2026-11-10 is a Tuesday.
const dry: RegenerateDryRun = {
  replaces: 3,
  bought: [
    { date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', recipeName: 'Roast chicken', ingredients: ['chicken thighs', 'cream'] },
    { date: '2026-11-11', mealSlotName: 'Lunch', courseName: 'Side', recipeName: 'Green beans', ingredients: ['beans'] },
  ],
}

describe('regenerateConfirmCopy with a dry run', () => {
  it('keeps the count first, then the intro, then one line per Bought meal', () => {
    const body = regenerateConfirmCopy(3, dry).body
    const count = body.indexOf('3 unpinned Planned Meals will change.')
    const intro = body.indexOf('These have Ingredients you already bought and are replaced too:')
    const first = body.indexOf('Tue Dinner · Roast chicken (chicken thighs, cream).')
    const second = body.indexOf('Wed Lunch · Green beans (beans).')
    expect(count).toBe(0)
    expect(intro).toBeGreaterThan(count)
    expect(first).toBeGreaterThan(intro)
    expect(second).toBeGreaterThan(first)
  })
  it('offers no "keep them" action: same title and confirm label', () => {
    expect(regenerateConfirmCopy(3, dry)).toMatchObject({ title: 'Regenerate the plan?', confirmLabel: 'Regenerate' })
  })
  it('nothing Bought, no dry run or a null one: the body is the plain count', () => {
    const plain = regenerateConfirmCopy(3).body
    expect(regenerateConfirmCopy(3, { replaces: 3, bought: [] }).body).toBe(plain)
    expect(regenerateConfirmCopy(3, null).body).toBe(plain)
    expect(plain).not.toMatch(/bought/)
  })
  it('lists the Bought meals even when the count is zero', () => {
    const body = regenerateConfirmCopy(0, dry).body
    expect(body).toContain('No Planned Meals will change.')
    expect(body).toContain('Tue Dinner · Roast chicken (chicken thighs, cream).')
  })
})

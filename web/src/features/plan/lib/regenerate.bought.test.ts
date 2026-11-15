// B5-BOW + SAFE-07: the Regenerate question lists the Bought Planned Meals as rows behind one summary line, not as sentences.
import { describe, expect, it } from 'vitest'
import type { RegenerateDryRun } from './bought'
import { regenerateConfirmCopy } from './regenerate'

// 2026-11-10 is a Tuesday.
const dry: RegenerateDryRun = {
  replaces: 3,
  bought: [
    { date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', recipeName: 'Roast chicken with lemon, garlic and thyme', ingredients: ['chicken thighs', 'cream'] },
    { date: '2026-11-11', mealSlotName: 'Lunch', courseName: 'Side', recipeName: 'Green beans', ingredients: ['beans'] },
  ],
}

describe('regenerateConfirmCopy with a dry run', () => {
  it('one summary line with the count, and one row per Bought meal: the day and slot, what was bought, the Recipe', () => {
    expect(regenerateConfirmCopy(3, dry).details).toEqual({
      summary: '2 Bought Planned Meals are replaced',
      rows: [
        { key: 'Tue Dinner', state: 'chicken thighs, cream bought', detail: 'Roast chicken with lemon, garlic and thyme' },
        { key: 'Wed Lunch', state: 'beans bought', detail: 'Green beans' },
      ],
    })
  })

  it('one Bought meal: "1 Bought Planned Meal is replaced"', () => {
    expect(regenerateConfirmCopy(3, { replaces: 3, bought: [dry.bought[0]!] }).details?.summary).toBe('1 Bought Planned Meal is replaced')
  })

  it('the lead is the count, and the old intro sentence and "Day Slot · Recipe (names)." lines are gone', () => {
    const copy = regenerateConfirmCopy(3, dry)
    expect(copy.body).toBe('3 unpinned Planned Meals will change.')
    expect(JSON.stringify(copy)).not.toMatch(/Among them|already bought/)
  })

  it('offers no "keep them" action: same title and confirm label', () => {
    expect(regenerateConfirmCopy(3, dry)).toMatchObject({ title: 'Regenerate the plan?', confirmLabel: 'Regenerate' })
  })

  it('nothing Bought, no dry run or a null one: no details', () => {
    expect(regenerateConfirmCopy(3, { replaces: 3, bought: [] }).details).toBeUndefined()
    expect(regenerateConfirmCopy(3).details).toBeUndefined()
    expect(regenerateConfirmCopy(3, null).details).toBeUndefined()
  })

  it('lists the Bought meals even when the count is zero', () => {
    const copy = regenerateConfirmCopy(0, dry)
    expect(copy.body).toContain('No Planned Meals will change.')
    expect(copy.details?.rows).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import { makeLine, makePast } from '../testData'
import { lineEntry } from './lines'

// b8-shop: the one-line hint of a row names the first slot and counts the rest, so it fits the text column of a 360 px row and of a
// 3-column card (docs/dev/design/b8-shop.md 2; review: no "Includes", which P23 found cut at 360, 390, 1440 and 1920 px). The sheet's full hint keeps every slot. 2026-11-03 is a Tuesday.
const wed = { date: '2026-11-04', mealSlotId: 2, mealSlotName: 'Lunch' }
const entry = (meals: ReturnType<typeof makePast>[]) => lineEntry(makeLine({ pastPlannedMeals: meals }), 'USD', 'metric')

describe('hintShort', () => {
  it('one slot: "Tue Dinner"', () => {
    expect(entry([makePast()]).hintShort).toBe('Tue Dinner')
  })
  it('the Courses of one slot do not count as more', () => {
    expect(entry([makePast({ courseName: 'Starter' }), makePast({ courseName: 'Side' })]).hintShort).toBe('Tue Dinner')
  })
  it('two slots: the first and "+1"', () => {
    expect(entry([makePast(), makePast(wed)]).hintShort).toBe('Tue Dinner +1')
  })
  it('three slots: the first and "+2"', () => {
    expect(entry([makePast({ date: '2026-11-02' }), makePast(), makePast(wed)]).hintShort).toBe('Mon Dinner +2')
  })
  it('stays short: at most 16 characters for the usual slot names', () => {
    expect(entry([makePast(), makePast(wed), makePast({ date: '2026-11-05' })]).hintShort!.length).toBeLessThanOrEqual(16)
  })
  it('the full hint (for the sheet) still names every slot', () => {
    expect(entry([makePast(), makePast(wed)]).hint).toBe('Includes Tue Dinner and Wed Lunch, not marked Cooked yet')
  })
  it('uses no word the glossary forbids (meal on its own)', () => {
    expect(entry([makePast(), makePast(wed)]).hintShort).not.toMatch(/\bmeals?\b/i)
  })
})

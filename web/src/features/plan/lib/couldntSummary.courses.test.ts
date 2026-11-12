// CRS G2 (spec 7.4): the summary line names the Course when only some Courses of a slot are affected.
import { describe, expect, it } from 'vitest'
import { EXCLUDED, NOBODY, NO_COURSE_RECIPES, WEEK, dinner, empty, flat, otherSlot, planned } from '../couldnt-fixtures'
import { courseCells, unplannedOf } from './couldntGroups'
import { summarizeCells, summarizeSlots } from './couldntSummary'

/** Tue 10 .. Mon 16 dinners with Main and Side; a Lunch (Main only) on weekdays. */
const lunches = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16'].map((d) => otherSlot(d, 'Lunch', 5, [planned(1, 'Main')]))
const sides = (excluded: string[]) => WEEK.map((d) => dinner(d, [planned(1, 'Main'), excluded.includes(d) ? empty(2, 'Side', EXCLUDED) : planned(2, 'Side')]))
const summary = (slots: ReturnType<typeof sides>, extra = lunches) => summarizeCells(unplannedOf(courseCells([...slots, ...extra])), courseCells([...slots, ...extra]))

describe('summarizeSlots, inside a sentence', () => {
  const dinners = WEEK.map((d, i) => flat(d, 1, 'Main', NOBODY, { mealSlotId: 100 + i }))
  it('without the capital: "every dinner this week"', () => {
    expect(summarizeSlots(dinners, dinners, { capitalise: false })).toBe('every dinner this week')
  })
  it('a weekday stays capitalised: "Tuesday and Wednesday dinners"', () => {
    expect(summarizeSlots(dinners.slice(0, 2), dinners, { capitalise: false })).toBe('Tuesday and Wednesday dinners')
  })
  it('by default it is capitalised, as before', () => {
    expect(summarizeSlots(dinners, dinners)).toBe('Every dinner this week')
  })
})

describe('summarizeCells: a Course named when only it is affected', () => {
  it('"Side at every dinner this week": "every" is measured against the Course\'s own cells, so a Main-only Lunch does not count', () => {
    expect(summary(sides(WEEK))).toBe('Side at every dinner this week')
  })

  it('some of the Side dinners, by day', () => {
    expect(summary(sides(['2026-11-10', '2026-11-11']))).toBe('Side at Tuesday and Wednesday dinners')
  })

  it('weekend dinners', () => {
    expect(summary(sides(['2026-11-14', '2026-11-15']))).toBe('Side at weekend dinners')
  })

  it('two Courses: the one with more cells first', () => {
    const slots = WEEK.map((d) => {
      const weekend = d === '2026-11-14' || d === '2026-11-15'
      return dinner(d, [planned(1, 'Main'), empty(2, 'Side', EXCLUDED), weekend ? empty(3, 'Dessert', NO_COURSE_RECIPES) : planned(3, 'Dessert')])
    })
    const cells = unplannedOf(courseCells(slots)).filter((c) => c.unfilled !== null)
    expect(summarizeCells(cells, courseCells(slots))).toBe('Side at every dinner this week, plus Dessert at weekend dinners')
  })

  it('a slot that has every Course affected is summarised once, as the slot, ahead of the Courses', () => {
    const slots = [
      dinner('2026-11-10', [empty(1, 'Main', EXCLUDED), empty(2, 'Side', EXCLUDED)]),
      ...WEEK.slice(1).map((d) => dinner(d, [planned(1, 'Main'), d === '2026-11-11' || d === '2026-11-12' ? empty(2, 'Side', EXCLUDED) : planned(2, 'Side')])),
    ]
    expect(summarizeCells(unplannedOf(courseCells(slots)), courseCells(slots))).toBe('Tuesday dinner, plus Side at Wednesday and Thursday dinners')
  })

  it('Nobody attends: one clause per slot, however many Courses it has', () => {
    const slots = WEEK.map((d) => dinner(d, [empty(1, 'Main', NOBODY), empty(2, 'Side', NOBODY)]))
    expect(summarizeCells(unplannedOf(courseCells(slots)), courseCells(slots))).toBe('Every dinner this week')
  })

  it('slots whose time has gone (no Planned Meal, no reason) do not count for "every"', () => {
    const gone = dinner('2026-11-10', [])
    const slots = [gone, ...sides(WEEK.slice(1)).slice(1)]
    expect(summarizeCells(unplannedOf(courseCells(slots)), courseCells(slots))).toBe('Side at every dinner this week')
  })

  it('without Courses it is exactly summarizeSlots (a Household before Courses)', () => {
    const dinners = WEEK.map((d, i) => flat(d, 1, 'Main', EXCLUDED, { mealSlotId: 100 + i }))
    const breakfasts = ['2026-11-14', '2026-11-15'].map((d, i) => flat(d, 1, 'Main', EXCLUDED, { name: 'Breakfast', mealSlotId: 200 + i }))
    const all = [...dinners, ...breakfasts]
    expect(summarizeCells(courseCells(all), all)).toBe(summarizeSlots(all, all))
    expect(summarizeCells(courseCells(all), all)).toBe('Every dinner this week, plus weekend breakfasts')
  })

  it('no cells, no summary', () => expect(summarizeCells([], [])).toBe(''))
})

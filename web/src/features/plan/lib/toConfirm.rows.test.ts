// DS-TODAY (docs/design/system.md §9, option A): To confirm is one row per Meal Slot on a date, never one per Course.
// toConfirmRows folds the flat entries (one per Course) into those rows; the same dish never shows twice in a row.
import { describe, expect, it } from 'vitest'
import { courseMeal, planCourse, slot } from '../test-utils'
import type { PlanEntry } from '../types'
import { toConfirmRows, toConfirmSidesLine } from './toConfirm'

/** A to-confirm entry: the slot's `courses` carry the `main` flag, the entry itself is one Course. */
function entry(courseId: number, courseName: string, recipeName: string, over: Partial<PlanEntry> = {}): PlanEntry {
  const date = over.date ?? '2026-11-11'
  return slot({
    date,
    mealSlotId: 4,
    name: 'Dinner',
    courseId,
    courseName,
    meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date }),
    courses: [
      planCourse({ courseId: 1, name: 'Main', main: true }),
      planCourse({ courseId: 2, name: 'Side', main: false }),
      planCourse({ courseId: 3, name: 'Dessert', main: false }),
    ],
    ...over,
  })
}

describe('toConfirmRows: one row per Meal Slot', () => {
  it('a slot with one Course is one row with that Recipe as its Main Recipe', () => {
    const rows = toConfirmRows([entry(1, 'Main', "Sam's Manicotti")])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      slot: { date: '2026-11-11', mealSlotId: 4 },
      dayLabel: 'Wed',
      slotName: 'Dinner',
      main: "Sam's Manicotti",
      sides: [],
      courseCount: 1,
      primary: 'cooked',
      single: { date: '2026-11-11', mealSlotId: 4, courseId: 1 },
    })
  })

  it('the Courses of one slot fold into one row: Main Recipe first, the others as sides, primary "All Cooked"', () => {
    const rows = toConfirmRows([entry(2, 'Side', 'Two-colour cauliflower'), entry(1, 'Main', "Sam's Manicotti")])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      main: "Sam's Manicotti",
      sides: [{ courseName: 'Side', recipeName: 'Two-colour cauliflower' }],
      courseCount: 2,
      primary: 'allCooked',
    })
    expect(rows[0]!.single).toBeUndefined()
  })

  it('the Main Recipe comes from the Course flagged main, not from the order of the entries; without a flag it is the first entry', () => {
    const flagged = toConfirmRows([entry(3, 'Dessert', 'Tiramisu'), entry(1, 'Main', 'Roast chicken')])
    expect(flagged[0]!.main).toBe('Roast chicken')
    const noFlags = toConfirmRows([
      slot({ date: '2026-11-11', mealSlotId: 4, courseId: 7, courseName: 'Starter', meal: courseMeal(7, 'Starter', { recipeName: 'Soup', mealSlotId: 4, date: '2026-11-11' }) }),
      slot({ date: '2026-11-11', mealSlotId: 4, courseId: 8, courseName: 'Mains', meal: courseMeal(8, 'Mains', { recipeName: 'Stew', mealSlotId: 4, date: '2026-11-11' }) }),
    ])
    expect(noFlags[0]!.main).toBe('Soup')
  })

  it('two slots (or two dates) stay two rows, in order of first appearance', () => {
    const rows = toConfirmRows([
      entry(1, 'Main', 'Stew', { date: '2026-11-10' }),
      entry(1, 'Main', 'Soup', { date: '2026-11-11', mealSlotId: 1, name: 'Lunch' }),
      entry(2, 'Side', 'Bread', { date: '2026-11-10' }),
    ])
    expect(rows.map((r) => `${r.dayLabel} ${r.slotName}`)).toEqual(['Tue Dinner', 'Wed Lunch'])
    expect(rows[0]!.courseCount).toBe(2)
  })

  it('the same dish never appears twice: a side with the Main Recipe\'s name, or a repeated side, is dropped (the Course still counts)', () => {
    const rows = toConfirmRows([entry(1, 'Main', "Sam's Manicotti"), entry(2, 'Side', "sam's manicotti"), entry(3, 'Dessert', 'Tiramisu')])
    expect(rows[0]!.sides).toEqual([{ courseName: 'Dessert', recipeName: 'Tiramisu' }])
    expect(rows[0]!.courseCount).toBe(3)
    const twice = toConfirmRows([entry(1, 'Main', 'Stew'), entry(2, 'Side', 'Rice'), entry(3, 'Dessert', 'rice')])
    expect(twice[0]!.sides.map((x) => x.recipeName)).toEqual(['Rice'])
  })

  it('an entry without a Recipe (meal null) shows no name and no side, but still counts as a Course to confirm', () => {
    const rows = toConfirmRows([entry(1, 'Main', 'Stew'), entry(2, 'Side', 'x', { meal: null })])
    expect(rows[0]!.sides).toEqual([])
    expect(rows[0]!.courseCount).toBe(2)
  })

  it('no entries, no rows', () => {
    expect(toConfirmRows([])).toEqual([])
  })
})

describe('toConfirmSidesLine: "+ Side · name", one line', () => {
  const row = (sides: { courseName: string; recipeName: string }[]) => ({ ...toConfirmRows([entry(1, 'Main', 'Stew')])[0]!, sides })

  it('no sides, no line', () => {
    expect(toConfirmSidesLine(row([]))).toBeNull()
  })

  it('one other Course: "+ <Course> · <Recipe>"', () => {
    expect(toConfirmSidesLine(row([{ courseName: 'Side', recipeName: 'Two-colour cauliflower with peppers' }]))).toBe('+ Side · Two-colour cauliflower with peppers')
  })

  it('several other Courses: "+ 2 more · A, B" (the sheet that Adjust opens shows each)', () => {
    expect(
      toConfirmSidesLine(row([{ courseName: 'Side', recipeName: 'Green beans' }, { courseName: 'Dessert', recipeName: 'Tiramisu' }])),
    ).toBe('+ 2 more · Green beans, Tiramisu')
  })
})

// CRS F (spec 8): To confirm groups a slot's Courses under one heading; Mark all Cooked builds its body.
import { describe, expect, it } from 'vitest'
import { allCookedBody, groupToConfirm, type AllCookedRow } from './toConfirm'
import { courseMeal, slot } from '../test-utils'

const entry = (courseId: number, courseName: string, recipeName: string, over = {}) =>
  slot({ courseId, courseName, meal: courseMeal(courseId, courseName, { recipeName }), ...over })

describe('groupToConfirm', () => {
  it('one Course per slot: the Recipe name is the heading, as before', () => {
    const [g] = groupToConfirm([slot({ meal: courseMeal(1, 'Main', { recipeName: 'Chicken curry' }) })])
    expect(g!.heading).toBe('Chicken curry')
    expect(g!.entries).toHaveLength(1)
    expect(g!.slot).toEqual({ date: '2026-11-10', mealSlotId: 2 })
  })

  it('several Courses of one slot: "Tue Dinner: Roast chicken, Green beans"', () => {
    const [g, ...rest] = groupToConfirm([entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')])
    expect(rest).toHaveLength(0)
    expect(g!.heading).toBe('Tue Dinner: Roast chicken, Green beans')
    expect(g!.entries.map((e) => e.courseName)).toEqual(['Main', 'Side'])
  })

  it('groups by date and Meal Slot, in the order of first appearance', () => {
    const lunch = (course: number, name: string) => entry(course, 'Main', name, { mealSlotId: 1, name: 'Lunch' })
    const groups = groupToConfirm([entry(1, 'Main', 'Roast chicken'), lunch(1, 'Soup'), entry(2, 'Side', 'Green beans'), entry(1, 'Main', 'Hash', { date: '2026-11-09', meal: courseMeal(1, 'Main', { recipeName: 'Hash', date: '2026-11-09' }) })])
    expect(groups.map((g) => g.heading)).toEqual(['Tue Dinner: Roast chicken, Green beans', 'Soup', 'Hash'])
  })

  it('nothing to confirm gives no groups', () => {
    expect(groupToConfirm([])).toEqual([])
  })
})

describe('allCookedBody', () => {
  const row = (courseId: number, over: Partial<AllCookedRow> = {}): AllCookedRow => ({
    courseId, courseName: 'Main', recipeName: 'Roast chicken', fresh: true, proposedLeftover: 2, maxLeftover: 4, leftover: 2, leftoverUseBy: '2026-11-13', ...over,
  })

  it('one entry per fresh Course with its edited Leftover, in row order', () => {
    expect(allCookedBody([row(1, { leftover: 1.5 }), row(2, { leftover: 0 })])).toEqual([
      { courseId: 1, leftoverPortions: 1.5 },
      { courseId: 2, leftoverPortions: 0 },
    ])
  })

  it('a Leftover Course has no Leftover to record: left out', () => {
    expect(allCookedBody([row(1), row(2, { fresh: false, leftover: 0 })])).toEqual([{ courseId: 1, leftoverPortions: 2 }])
  })
})

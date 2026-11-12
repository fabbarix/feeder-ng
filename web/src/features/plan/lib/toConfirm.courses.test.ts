// CRS F review: the Courses of one to-confirm slot, for Today's Mark all Cooked (was inline in TodayScreen).
import { describe, expect, it } from 'vitest'
import { courseMeal, slot } from '../test-utils'
import type { PlanEntry } from '../types'
import { toConfirmCourses } from './toConfirm'

// An entry without a courseId is deliberately not a full PlanEntry: the cases below check it is left out.
const entry = (courseId: number | undefined, over = {}) =>
  slot({ date: '2026-11-09', mealSlotId: 4, ...(courseId === undefined ? {} : { courseId, courseName: `C${courseId}` }), meal: courseMeal(courseId ?? 1, 'X', {}), ...over }) as PlanEntry

describe('toConfirmCourses(entries, key)', () => {
  it('the course ids of the entries of that date and Meal Slot, in entry order', () => {
    const entries = [entry(1), entry(3), entry(2)]
    expect(toConfirmCourses(entries, { date: '2026-11-09', mealSlotId: 4 })).toEqual([1, 3, 2])
  })

  it('leaves out other slots and other dates', () => {
    const entries = [entry(1), entry(2, { mealSlotId: 5 }), entry(3, { date: '2026-11-08' }), entry(4)]
    expect(toConfirmCourses(entries, { date: '2026-11-09', mealSlotId: 4 })).toEqual([1, 4])
  })

  it('an entry without a courseId names no Course: it is left out, never read as 0', () => {
    expect(toConfirmCourses([entry(undefined)], { date: '2026-11-09', mealSlotId: 4 })).toEqual([])
    expect(toConfirmCourses([entry(undefined), entry(2)], { date: '2026-11-09', mealSlotId: 4 })).toEqual([2])
  })

  it('nothing to confirm for the slot: empty', () => {
    expect(toConfirmCourses([], { date: '2026-11-09', mealSlotId: 4 })).toEqual([])
    expect(toConfirmCourses([entry(1)], { date: '2026-11-09', mealSlotId: 9 })).toEqual([])
  })
})

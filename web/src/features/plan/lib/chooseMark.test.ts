// B9-38 (PC-10, user decision): a pick from "Other Recipes" marks the Recipe and sets it in one write; its toast says both and
// that the mark stays after Undo. 2026-11-10 is a Tuesday.
import { describe, expect, it } from 'vitest'
import type { Leftover } from '../../../lib/leftovers/types'
import { courseSlot, planCourse } from '../test-utils'
import { markedChoiceWords, mealLeftover } from './chooseMark'

const dinner = courseSlot([planCourse({ courseId: 1, name: 'Main', main: true }), planCourse({ courseId: 3, name: 'Dessert', main: false })], { date: '2026-11-10', mealSlotId: 2, name: 'Dinner' })
const key = { date: '2026-11-10', mealSlotId: 2, courseId: 3 }

describe('markedChoiceWords', () => {
  it('"<Recipe> chosen for <slot> and marked as <Course>", with "It stays marked as <Course>." as the subline', () => {
    const w = markedChoiceWords(null, { recipeName: 'Baked apples', key, slots: [dinner] })
    expect(w.headline).toBe('Baked apples chosen for Tue Dinner and marked as Dessert')
    expect(w.subline).toBe('It stays marked as Dessert.')
    expect(w.review).toBe(false)
  })

  it("keeps the ordinary Choose toast's Review, body and Undo name", () => {
    const base = { headline: 'Recipe chosen for Tue Dinner Dessert', subline: '1 other meal changed', body: 'Wed Lunch is now Soup.', review: true, reviewAriaLabel: 'Review 1 changed meal', undoAriaLabel: 'Undo the Recipe choice and 1 other change' }
    const w = markedChoiceWords(base, { recipeName: 'Baked apples', courseName: 'Dessert', key, slots: [dinner] })
    expect(w).toMatchObject({ headline: 'Baked apples chosen for Tue Dinner and marked as Dessert', subline: 'It stays marked as Dessert.', body: 'Wed Lunch is now Soup.', review: true, undoAriaLabel: base.undoAriaLabel })
  })
})

describe('mealLeftover', () => {
  const l = (over: Partial<Leftover>): Leftover => ({
    id: 9, recipeId: 7, recipeName: 'Chicken curry', portions: 2.5, cookedOn: '2026-11-10', useBy: '2026-11-13', fromDate: '2026-11-10', fromMealSlotId: 2,
    storagePlaceId: null, storagePlaceName: null, frozen: false, frozenOn: null, toAnswer: false, plannedPortions: 0, ...over,
  })
  it('finds the Leftover the Course made, by its date, Meal Slot and Course', () => {
    const mine = l({ id: 1, fromCourseId: 3 })
    expect(mealLeftover([l({ id: 2, fromCourseId: 1 }), mine], key)).toBe(mine)
    expect(mealLeftover([l({ id: 3, fromDate: '2026-11-09', fromCourseId: 3 })], key)).toBeNull()
    expect(mealLeftover([], null)).toBeNull()
  })
})

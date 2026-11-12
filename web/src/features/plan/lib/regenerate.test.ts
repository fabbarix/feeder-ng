import { describe, expect, it } from 'vitest'
import { planStrings } from '../strings'
import { readSource } from '../test-css'
import { courseMeal, courseSlot, meal, planCourse } from '../test-utils'
import { serverSlot } from '../test-utils.c3'
import { regenerateConfirmCopy, regenerateImpact } from './regenerate'

const today = '2026-11-10'
// A one-Course slot as the server sends it (C3: the meal is on the Course row).
const slot = (over: { date: string; mealSlotId: number; meal: ReturnType<typeof meal> | null }) =>
  courseSlot([planCourse({ courseId: 1, meal: over.meal ? courseMeal(1, 'Main', over.meal) : null })], { date: over.date, mealSlotId: over.mealSlotId })

describe('regenerateImpact', () => {
  it('counts the planned, unpinned Planned Meals from today on', () => {
    const slots = [
      slot({ date: '2026-11-09', mealSlotId: 1, meal: meal({ date: '2026-11-09' }) }), // yesterday: not touched
      slot({ date: '2026-11-10', mealSlotId: 1, meal: meal({ date: '2026-11-10' }) }),
      slot({ date: '2026-11-10', mealSlotId: 2, meal: meal({ pinned: true }) }),
      slot({ date: '2026-11-11', mealSlotId: 2, meal: meal({ date: '2026-11-11' }) }),
      slot({ date: '2026-11-12', mealSlotId: 2, meal: meal({ date: '2026-11-12', state: 'cooked' }) }),
      slot({ date: '2026-11-13', mealSlotId: 2, meal: null }),
    ]
    expect(regenerateImpact(slots, today)).toBe(2)
  })

  it('counts every Course of a slot, not the main Course alone (the slot carries no meal of its own)', () => {
    const dinner = serverSlot([
      planCourse({ courseId: 1, main: true, meal: courseMeal(1, 'Main', { date: '2026-11-10' }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date: '2026-11-10' }) }),
      planCourse({ courseId: 3, name: 'Dessert', main: false, meal: courseMeal(3, 'Dessert', { date: '2026-11-10', pinned: true }) }),
    ], { date: '2026-11-10', mealSlotId: 4 })
    expect(regenerateImpact([dinner], today)).toBe(2)
  })

  it('is 0 for an empty plan', () => {
    expect(regenerateImpact([], today)).toBe(0)
  })
})

describe('Regenerate copy lives in strings.ts', () => {
  it('planStrings carries the dialog title, the confirm label and both bodies', () => {
    expect(planStrings.regenerateConfirmTitle).toBe('Regenerate the plan?')
    expect(planStrings.regenerateConfirmLabel).toBe('Regenerate')
    expect(planStrings.regenerateNone).toBe('No Planned Meals will change. Empty Meal Slots may be filled.')
    expect(planStrings.regenerateCount(1)).toBe('1 unpinned Planned Meal will change. Pinned and Cooked ones stay as they are.')
    expect(planStrings.regenerateCount(3)).toBe('3 unpinned Planned Meals will change. Pinned and Cooked ones stay as they are.')
  })

  it('regenerate.ts holds no copy of its own', () => {
    const source = readSource('features/plan/lib/regenerate.ts')
    expect(source).not.toBe('')
    expect(source).not.toMatch(/Planned Meal|Regenerate the plan|Empty Meal Slots/)
  })
})

describe('regenerateConfirmCopy', () => {
  it('states how many unpinned Planned Meals will change', () => {
    expect(regenerateConfirmCopy(5)).toEqual({
      title: 'Regenerate the plan?',
      body: '5 unpinned Planned Meals will change. Pinned and Cooked ones stay as they are.',
      confirmLabel: 'Regenerate',
    })
  })

  it('singular', () => {
    expect(regenerateConfirmCopy(1).body).toBe('1 unpinned Planned Meal will change. Pinned and Cooked ones stay as they are.')
  })

  it('none: says so, empty Meal Slots may still be filled', () => {
    expect(regenerateConfirmCopy(0).body).toBe('No Planned Meals will change. Empty Meal Slots may be filled.')
  })
})

// CRS G2: useSetupFacts reads the plan per Course (a slot has `courses`; since C3 it has no `meal` or `unfilled` of its own).
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../settings/test-utils'
import { useSetupFacts } from './setupSeam'

afterEach(() => vi.unstubAllGlobals())

const att = [{ memberId: 1, portionFactorOverride: null }]
const mealSlot = (id: number) => ({ id, weekday: id, name: 'Dinner', time: '19:00', portionsNeeded: 1, attendance: att })
const course = (courseId: number, state: 'meal' | 'reason' | 'unserved') => ({
  courseId,
  name: courseId === 1 ? 'Main' : 'Side',
  meal: state === 'meal' ? { recipeName: 'Soup', state: 'planned' } : null,
  unfilled: state === 'reason' ? { reason: 'no_course_recipes' } : null,
  unserved: state === 'unserved' ? 'optional' : null,
})
const planView = (slots: unknown[]) => ({ today: '2026-11-10', horizonDays: 7, updating: false, slots })

async function facts(slots: unknown[]) {
  mockApi({ 'GET /api/members': [{ id: 1 }], 'GET /api/meal-slots': [mealSlot(1)], 'GET /api/recipes': [{ id: 1 }], 'GET /api/plan': planView(slots) })
  const { result } = renderHook(() => useSetupFacts(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result.current.facts
}

describe('useSetupFacts with Courses', () => {
  it('counts the Planned Meals and the empty Courses of every Course, not only the slot\'s', async () => {
    const f = await facts([{ courses: [course(1, 'meal'), course(2, 'reason')] }, { courses: [course(1, 'meal'), course(2, 'meal')] }])
    expect(f).toMatchObject({ plannedMeals: 3, unplannedMeals: 1 })
  })

  it('a plan whose slots carry only `courses` is not a first run: its Planned Meals are counted', async () => {
    const f = await facts([{ courses: [course(1, 'meal')] }])
    expect(f!.plannedMeals).toBe(1)
  })

  it('a Side with no Recipes marked for it is an unplanned meal; an optional Course left empty is nothing', async () => {
    const f = await facts([{ courses: [course(1, 'meal'), course(2, 'reason'), { ...course(3, 'unserved') }] }])
    expect(f).toMatchObject({ plannedMeals: 1, unplannedMeals: 1 })
  })

  it('slots without `courses` still work (the course-less payload)', async () => {
    const f = await facts([{ meal: { recipeName: 'Soup', state: 'planned' } }, { meal: null, unfilled: { reason: 'no_attendance' } }])
    expect(f).toMatchObject({ plannedMeals: 1, unplannedMeals: 1 })
  })
})

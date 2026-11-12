import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../settings/test-utils'
import { useSetupFacts } from './setupSeam'

afterEach(() => vi.unstubAllGlobals())

// useSetupFacts reads other features' endpoints, like the rest of seams: counts only, no domain logic.
const slot = (id: number, att: number[]) => ({
  id, weekday: id, name: 'Dinner', time: '19:00', portionsNeeded: att.length,
  attendance: att.map((memberId) => ({ memberId, portionFactorOverride: null })),
})
const planView = (slots: unknown[]) => ({ today: '2026-11-10', horizonDays: 7, updating: false, slots })

describe('useSetupFacts', () => {
  it('counts Members, Meal Slots with attendees, Recipes, Planned Meals and unplanned meals', async () => {
    mockApi({
      'GET /api/members': [{ id: 1 }, { id: 2 }],
      'GET /api/meal-slots': [slot(1, [1, 2]), slot(2, [])],
      'GET /api/recipes': [{ id: 1 }, { id: 2 }, { id: 3 }],
      'GET /api/plan': planView([{ courses: [{ meal: { recipeName: 'Soup', state: 'planned' } }] }, { courses: [{ meal: null, unfilled: { reason: 'no_attendance' } }] }, { courses: [{ meal: null, unfilled: null }] }]),
    })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts).toEqual({ members: 2, mealSlots: 2, mealSlotsWithAttendance: 1, recipes: 3, plannedMeals: 1, unplannedMeals: 1 })
  })

  it('a brand new household is all zeros', async () => {
    mockApi({ 'GET /api/members': [], 'GET /api/meal-slots': [], 'GET /api/recipes': [], 'GET /api/plan': planView([]) })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts).toEqual({ members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 0 })
  })

  it('one failing request means no facts, never a false first run', async () => {
    mockApi({
      'GET /api/members': [{ id: 1 }],
      'GET /api/meal-slots': { status: 500, json: { error: { code: 'internal', message: 'boom' } } },
      'GET /api/recipes': [],
      'GET /api/plan': planView([]),
    })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts).toBeNull()
  })

  it('is loading until all four have answered', async () => {
    mockApi({ 'GET /api/members': [], 'GET /api/meal-slots': [], 'GET /api/recipes': [], 'GET /api/plan': planView([]) })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    expect(result.current.loading).toBe(true)
    expect(result.current.facts).toBeNull()
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

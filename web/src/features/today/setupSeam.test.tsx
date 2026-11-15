// B9-53 (TB-06; changed on purpose, the whole file): useSetupFacts also reads GET /api/household/settings (timeZone, currency, timeZoneConfigured,
// setupHidden) and the names the done steps summarise. Counts and names only, no domain logic.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../settings/test-utils'
import { settings } from '../../test/setupFacts'
import { useSetupFacts } from './setupSeam'

afterEach(() => vi.unstubAllGlobals())

const slot = (id: number, att: number[], over: Record<string, unknown> = {}) => ({
  id, weekday: id, name: 'Dinner', time: '19:00', portionsNeeded: att.length,
  attendance: att.map((memberId) => ({ memberId, portionFactorOverride: null })), ...over,
})
const planView = (slots: unknown[]) => ({ today: '2026-11-10', horizonDays: 7, updating: false, slots })
const brandNew = { 'GET /api/members': [], 'GET /api/meal-slots': [], 'GET /api/recipes': [], 'GET /api/plan': planView([]), 'GET /api/household/settings': settings() }

describe('useSetupFacts', () => {
  it('counts Members, Meal Slots with attendees, Recipes, Planned Meals and unplanned meals, and carries the settings', async () => {
    mockApi({
      'GET /api/members': [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }],
      'GET /api/meal-slots': [slot(1, [1, 2]), slot(2, [])],
      'GET /api/recipes': [{ id: 1 }, { id: 2 }, { id: 3 }],
      'GET /api/plan': planView([{ courses: [{ meal: { recipeName: 'Soup', state: 'planned' } }] }, { courses: [{ meal: null, unfilled: { reason: 'no_attendance' } }] }, { courses: [{ meal: null, unfilled: null }] }]),
      'GET /api/household/settings': settings({ timeZone: 'Europe/Rome', timeZoneConfigured: true, currency: 'EUR', setupHidden: true }),
    })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts).toMatchObject({
      members: 2, mealSlots: 2, mealSlotsWithAttendance: 1, recipes: 3, plannedMeals: 1, unplannedMeals: 1,
      timeZone: 'Europe/Rome', timeZoneConfigured: true, currency: 'EUR', setupHidden: true, memberNames: ['Anna', 'Ben'],
    })
  })

  it('a brand new household is all zeros, with the default zone and currency not confirmed', async () => {
    mockApi(brandNew)
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts).toEqual({
      members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 0,
      timeZoneConfigured: false, setupHidden: false, timeZone: 'UTC', currency: 'USD',
      memberNames: [], mealSlotNames: [], mealSlotsEveryDay: false, everyoneAttends: false,
    })
  })

  it('a server that does not send setupHidden (older than beta.9) is not hidden', async () => {
    const { setupHidden: _drop, ...older } = settings()
    mockApi({ ...brandNew, 'GET /api/household/settings': older })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts!.setupHidden).toBe(false)
  })

  it('the Meal Slot names are the distinct names in time order; every day when each name has all 7 weekdays', async () => {
    const week = (name: string, time: string, att: number[]) => [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d * 10 + time.length + name.length, att, { weekday: d, name, time }))
    mockApi({
      ...brandNew,
      'GET /api/members': [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }],
      'GET /api/meal-slots': [...week('Dinner', '19:30', [1, 2]), ...week('Breakfast', '07:30', [1, 2]), ...week('Lunch', '13:00', [1, 2])],
    })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts).toMatchObject({ mealSlotNames: ['Breakfast', 'Lunch', 'Dinner'], mealSlotsEveryDay: true, everyoneAttends: true, mealSlots: 21 })
  })

  it('a name on some weekdays only is not "every day"; a slot where a Member does not attend is not "everyone attends"', async () => {
    mockApi({
      ...brandNew,
      'GET /api/members': [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }],
      'GET /api/meal-slots': [slot(1, [1, 2], { weekday: 1 }), slot(2, [1], { weekday: 2 })],
    })
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.facts).toMatchObject({ mealSlotsEveryDay: false, everyoneAttends: false })
  })

  it('one failing request, the settings included, means no facts, never a false first run', async () => {
    for (const key of ['GET /api/members', 'GET /api/meal-slots', 'GET /api/recipes', 'GET /api/plan', 'GET /api/household/settings']) {
      mockApi({ ...brandNew, [key]: { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
      const { result, unmount } = renderHook(() => useSetupFacts(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.facts, key).toBeNull()
      unmount()
    }
  })

  it('is loading until all five have answered', async () => {
    mockApi(brandNew)
    const { result } = renderHook(() => useSetupFacts(), { wrapper })
    expect(result.current.loading).toBe(true)
    expect(result.current.facts).toBeNull()
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

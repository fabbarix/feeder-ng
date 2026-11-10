import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findNotice } from '../../../test/notices'
import { meal, mockApi, wrapper } from '../test-utils'
import type { CookedResult, CookPreview } from '../types'
import { useCookFlow } from './useCookFlow'
import { usePlanColumns } from './usePlanColumns'
import { useTagChoices } from './useTagChoices'

afterEach(() => vi.unstubAllGlobals())

const mediaStub = (width: number) =>
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
  })

describe('usePlanColumns', () => {
  it('2 columns on a phone, 4 on a tablet, 7 on a desktop', () => {
    mediaStub(390)
    expect(renderHook(() => usePlanColumns()).result.current).toBe(2)
    mediaStub(820)
    expect(renderHook(() => usePlanColumns()).result.current).toBe(4)
    mediaStub(1280)
    expect(renderHook(() => usePlanColumns()).result.current).toBe(7)
  })

  it('without matchMedia it is the desktop week', () => {
    expect(renderHook(() => usePlanColumns()).result.current).toBe(7)
  })
})

describe('useTagChoices (the Variety Rule Tag is picked from the existing Tags)', () => {
  it('reads GET /api/tags', async () => {
    const api = mockApi({ 'GET /api/tags': [{ name: 'pasta', recipes: 3 }, { name: 'fish', recipes: 1 }] })
    const { result } = renderHook(() => useTagChoices(), { wrapper })
    await waitFor(() => expect(result.current.tags).toHaveLength(2))
    expect(result.current.tags[0]).toEqual({ name: 'pasta', recipes: 3 })
    expect(api.callsTo('GET', '/api/tags')).toHaveLength(1)
  })

  it('stays idle while not enabled', () => {
    const api = mockApi({})
    const { result } = renderHook(() => useTagChoices(false), { wrapper })
    expect(result.current.tags).toEqual([])
    expect(api.calls).toHaveLength(0)
  })
})

describe('useCookFlow', () => {
  const key = { date: '2026-11-10', mealSlotId: 2 }
  const preview: CookPreview = {
    meal: meal(), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [],
  }
  const cooked: CookedResult = {
    meal: meal({ state: 'cooked' }),
    leftover: { id: 3, recipeId: 7, recipeName: 'Chicken curry', portions: 2, cookedOn: '2026-11-10', useBy: '2026-11-13', fromDate: '2026-11-10', fromMealSlotId: 2 },
    warnings: [{ ingredientId: 11, name: 'rice', baseUnit: 'g', have: 0, need: 250, shortfall: 250, message: 'Stock shows no rice, the recipe uses 250 g' }],
    plannedFor: [{ date: '2026-11-11', mealSlotId: 3, mealSlotName: 'Lunch', recipeName: 'Chicken curry' }],
  }

  it('quickCook: one tap posts Cooked with the planned Leftover and cheers where it went', async () => {
    const api = mockApi({ 'GET /api/plan/2026-11-10/2/cook': preview, 'POST /api/plan/2026-11-10/2/cooked': cooked, 'GET /api/plan': { today: '2026-11-10', horizonDays: 7, updating: false, slots: [] } })
    const { result } = renderHook(() => useCookFlow(), { wrapper })
    await act(async () => {
      await result.current.quickCook(key)
    })
    expect(api.callsTo('POST', '/api/plan/2026-11-10/2/cooked')[0]?.body).toEqual({ leftoverPortions: 2 })
    expect(await findNotice('status', 'Cooked, nice one! 2 portions → Wed Lunch')).toBeDefined()
    expect(result.current.warnings.map((w) => w.ingredientId)).toEqual([11])
    expect(result.current.quickBusy).toBeNull()
  })

  it('quickCook for a meal served from a Leftover sends no portions', async () => {
    const api = mockApi({
      'GET /api/plan/2026-11-10/2/cook': { ...preview, fresh: false, batches: 0, proposedLeftover: 0, maxLeftover: 0 },
      'POST /api/plan/2026-11-10/2/cooked': { ...cooked, leftover: null, plannedFor: [], warnings: [] },
    })
    const { result } = renderHook(() => useCookFlow(), { wrapper })
    await act(async () => {
      await result.current.quickCook(key)
    })
    expect(api.callsTo('POST', '/api/plan/2026-11-10/2/cooked')[0]?.body).toEqual({})
  })

  it('quickCook failing says so and leaves nothing half done', async () => {
    mockApi({
      'GET /api/plan/2026-11-10/2/cook': preview,
      'POST /api/plan/2026-11-10/2/cooked': { status: 500, json: { error: { code: 'internal', message: 'boom' } } },
    })
    const { result } = renderHook(() => useCookFlow(), { wrapper })
    await act(async () => {
      await result.current.quickCook(key)
    })
    expect(await findNotice('alert', 'That could not be saved. Nothing was changed.')).toBeDefined()
    expect(result.current.warnings).toEqual([])
    expect(result.current.quickBusy).toBeNull()
  })

  it('open and close drive the Adjust sheet', () => {
    mockApi({ 'GET /api/plan/2026-11-10/2/cook': preview })
    const { result } = renderHook(() => useCookFlow(), { wrapper })
    expect(result.current.cookKey).toBeNull()
    act(() => result.current.open(key))
    expect(result.current.cookKey).toEqual(key)
    act(() => result.current.close())
    expect(result.current.cookKey).toBeNull()
  })
})

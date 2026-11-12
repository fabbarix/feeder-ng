// CRS F (spec 8, 11): the Mark all Cooked sheet's state: one preview per Course, edited Leftovers, one POST to .../all/cooked.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, mockApi, wrapper } from '../test-utils'
import type { CookedAllResult, CookPreview } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'
import { useMarkAllCooked } from './useMarkAllCooked'
import { usePlan } from './usePlan'
import { usePlanActions } from './usePlanActions'

afterEach(() => vi.unstubAllGlobals())

const slotKey = { date: '2026-11-10', mealSlotId: 2 }
const preview = (courseId: number, courseName: string, recipeName: string, over: Partial<CookPreview> = {}): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4,
  leftoverUseBy: '2026-11-13', needs: [], ...over,
})
const routes = {
  'GET /api/plan/2026-11-10/2/1/cook': preview(1, 'Main', 'Roast chicken'),
  'GET /api/plan/2026-11-10/2/2/cook': preview(2, 'Side', 'Green beans', { proposedLeftover: 1, maxLeftover: 2 }),
  'GET /api/plan/2026-11-10/2/3/cook': preview(3, 'Dessert', 'Tiramisu', { fresh: false, proposedLeftover: 0, maxLeftover: 0 }),
}
const allResult: CookedAllResult = {
  meals: [],
  leftovers: [],
  warnings: [{ ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 400, shortfall: 100, message: 'Stock shows only 300 g chicken thighs' }],
  plannedFor: [],
}

describe('useMarkAllCooked', () => {
  it('stays idle without a slot', () => {
    const api = mockApi({})
    const { result } = renderHook(() => useMarkAllCooked(null, [1, 2]), { wrapper })
    expect(result.current.rows).toEqual([])
    expect(api.calls).toHaveLength(0)
  })

  it('loads one preview per Course and lists the rows in the order given, each at its proposal', async () => {
    mockApi(routes)
    const { result } = renderHook(() => useMarkAllCooked(slotKey, [1, 2, 3]), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    expect(result.current.rows).toEqual([
      { courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', fresh: true, proposedLeftover: 2, maxLeftover: 4, leftover: 2, leftoverUseBy: '2026-11-13' },
      { courseId: 2, courseName: 'Side', recipeName: 'Green beans', fresh: true, proposedLeftover: 1, maxLeftover: 2, leftover: 1, leftoverUseBy: '2026-11-13' },
      { courseId: 3, courseName: 'Dessert', recipeName: 'Tiramisu', fresh: false, proposedLeftover: 0, maxLeftover: 0, leftover: 0, leftoverUseBy: '2026-11-13' },
    ])
  })

  it('setLeftover edits one fresh Course, clamped to 0..maxLeftover; a Leftover Course ignores it', async () => {
    mockApi(routes)
    const { result } = renderHook(() => useMarkAllCooked(slotKey, [1, 2, 3]), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    act(() => result.current.setLeftover(1, 1.5))
    act(() => result.current.setLeftover(2, 9))
    act(() => result.current.setLeftover(3, 2))
    expect(result.current.rows.map((r) => r.leftover)).toEqual([1.5, 2, 0])
    act(() => result.current.setLeftover(1, -3))
    expect(result.current.rows[0]!.leftover).toBe(0)
  })

  it('confirm POSTs the fresh Courses with their Leftovers to .../all/cooked and keeps the Stock warnings', async () => {
    const api = mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': allResult })
    const { result } = renderHook(() => useMarkAllCooked(slotKey, [1, 2, 3]), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    act(() => result.current.setLeftover(1, 0.5))
    let out: CookedAllResult | null = null
    await act(async () => {
      out = await result.current.confirm()
    })
    expect(out).toEqual(allResult)
    expect(api.callsTo('POST', '/api/plan/2026-11-10/2/all/cooked')[0]!.body).toEqual({
      courses: [{ courseId: 1, leftoverPortions: 0.5 }, { courseId: 2, leftoverPortions: 1 }],
    })
    expect(result.current.warnings.map((w) => w.ingredientId)).toEqual([11])
    act(() => result.current.dismissWarning(11))
    expect(result.current.warnings).toEqual([])
  })

  it('refetches the plan after a successful confirm', async () => {
    const api = mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': { ...allResult, warnings: [] }, 'GET /api/plan': { today: '2026-11-10', slots: [] } })
    const { result } = renderHook(() => ({ all: useMarkAllCooked(slotKey, [1, 2, 3]), plan: usePlan() }), { wrapper })
    await waitFor(() => expect(result.current.all.rows).toHaveLength(3))
    await waitFor(() => expect(api.callsTo('GET', '/api/plan')).toHaveLength(1))
    await act(async () => {
      await result.current.all.confirm()
    })
    await waitFor(() => expect(api.callsTo('GET', '/api/plan')).toHaveLength(2))
  })

  it('a refused POST gives null and the usual message, and nothing is half-done', async () => {
    mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': { status: 409, json: { error: { code: 'already_resolved', message: 'x' } } } })
    const { result } = renderHook(() => useMarkAllCooked(slotKey, [1, 2]), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    let out: CookedAllResult | null | undefined
    await act(async () => {
      out = await result.current.confirm()
    })
    expect(out).toBeNull()
    expect(result.current.error).toBe('That could not be saved. Nothing was changed.')
    expect(result.current.result).toBeNull()
  })
})

describe('useAllCookedFlow', () => {
  it('open(slot, courseIds) loads the rows; confirm closes the sheet on success', async () => {
    mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': { ...allResult, warnings: [] } })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    expect(result.current.key).toBeNull()
    act(() => result.current.open(slotKey, [1, 2]))
    expect(result.current.key).toEqual(slotKey)
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    let ok = false
    await act(async () => {
      ok = await result.current.confirm()
    })
    expect(ok).toBe(true)
    expect(result.current.key).toBeNull()
  })

  it('a failed confirm keeps the sheet open and reports false', async () => {
    mockApi({ ...routes, 'POST /api/plan/2026-11-10/2/all/cooked': { status: 500, json: { error: { code: 'boom', message: 'x' } } } })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    act(() => result.current.open(slotKey, [1, 2]))
    await waitFor(() => expect(result.current.controller.rows).toHaveLength(2))
    let ok = true
    await act(async () => {
      ok = await result.current.confirm()
    })
    expect(ok).toBe(false)
    expect(result.current.key).toEqual(slotKey)
  })
})

describe('usePlanActions.notCookedSlot (Not cooked: whole slot)', () => {
  it('POSTs .../all/not-cooked and resolves true', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/all/not-cooked': { meals: [] } })
    const { result } = renderHook(() => usePlanActions(), { wrapper })
    let ok = false
    await act(async () => {
      ok = await result.current.notCookedSlot(slotKey)
    })
    expect(ok).toBe(true)
    expect(api.callsTo('POST', '/api/plan/2026-11-10/2/all/not-cooked')).toHaveLength(1)
  })

  it('reports a refusal through `error` and resolves false', async () => {
    mockApi({ 'POST /api/plan/2026-11-10/2/all/not-cooked': { status: 409, json: { error: { code: 'future_meal', message: 'Not yet' } } } })
    const { result } = renderHook(() => usePlanActions(), { wrapper })
    let ok = true
    await act(async () => {
      ok = await result.current.notCookedSlot(slotKey)
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe('Not yet')
  })
})

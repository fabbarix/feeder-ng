// DS-TODAY: "All Cooked" on a To confirm row is one tap, like "Cooked" on a one-Course row (useCookFlow.quickCook): read each
// Course's proposal, POST .../all/cooked with the planned Leftover of every FRESH Course, refetch the plan. Adjust is the sheet.
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allCookedResult, courseMeal, mockApi, wrapper } from '../test-utils'
import type { CookPreview } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'

afterEach(() => vi.unstubAllGlobals())

const slotKey = { date: '2026-11-10', mealSlotId: 4 }
const preview = (courseId: number, over: Partial<CookPreview> = {}): CookPreview => ({
  meal: courseMeal(courseId, courseId === 1 ? 'Main' : 'Side', { recipeName: 'R', mealSlotId: 4 }),
  fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [], ...over,
})

describe('useAllCookedFlow.quickAll', () => {
  it('posts every fresh Course with its proposed Leftover, in the order given, and resolves true without opening the sheet', async () => {
    const api = mockApi({
      'GET /api/plan/2026-11-10/4/1/cook': preview(1),
      'GET /api/plan/2026-11-10/4/2/cook': preview(2, { proposedLeftover: 1 }),
      'POST /api/plan/2026-11-10/4/all/cooked': allCookedResult(),
    })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    let ok = false
    await act(async () => {
      ok = await result.current.quickAll(slotKey, [1, 2])
    })
    expect(ok).toBe(true)
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')[0]!.body).toEqual({
      courses: [{ courseId: 1, leftoverPortions: 2 }, { courseId: 2, leftoverPortions: 1 }],
    })
    expect(result.current.key).toBeNull() // no sheet
    expect(result.current.quickBusy).toBeNull()
  })

  it('a Course served from a Leftover (not fresh) is left out of the body, as in the sheet', async () => {
    const api = mockApi({
      'GET /api/plan/2026-11-10/4/1/cook': preview(1),
      'GET /api/plan/2026-11-10/4/2/cook': preview(2, { fresh: false, proposedLeftover: 0 }),
      'POST /api/plan/2026-11-10/4/all/cooked': allCookedResult(),
    })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    await act(async () => {
      await result.current.quickAll(slotKey, [1, 2])
    })
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')[0]!.body).toEqual({ courses: [{ courseId: 1, leftoverPortions: 2 }] })
  })

  it('keeps the Stock shortfalls of the answer in `warnings`, like the sheet', async () => {
    mockApi({
      'GET /api/plan/2026-11-10/4/1/cook': preview(1),
      'GET /api/plan/2026-11-10/4/2/cook': preview(2),
      'POST /api/plan/2026-11-10/4/all/cooked': allCookedResult(),
    })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    await act(async () => {
      await result.current.quickAll(slotKey, [1, 2])
    })
    expect(result.current.warnings.map((w) => w.ingredientId)).toEqual([11])
  })

  it('a failed request changes nothing: resolves false (the error toast is the cookedError copy), no stale busy flag', async () => {
    const api = mockApi({
      'GET /api/plan/2026-11-10/4/1/cook': preview(1),
      'GET /api/plan/2026-11-10/4/2/cook': preview(2),
      'POST /api/plan/2026-11-10/4/all/cooked': { status: 500, json: { error: { code: 'boom', message: 'x' } } },
    })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    let ok = true
    await act(async () => {
      ok = await result.current.quickAll(slotKey, [1, 2])
    })
    expect(ok).toBe(false)
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')).toHaveLength(1)
    expect(result.current.quickBusy).toBeNull()
    expect(result.current.warnings).toEqual([])
  })

  it('a failing preview posts nothing', async () => {
    const api = mockApi({ 'GET /api/plan/2026-11-10/4/1/cook': { status: 500, json: { error: { code: 'boom', message: 'x' } } } })
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper })
    let ok = true
    await act(async () => {
      ok = await result.current.quickAll(slotKey, [1, 2])
    })
    expect(ok).toBe(false)
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')).toHaveLength(0)
  })
})

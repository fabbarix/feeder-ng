import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, wrapper } from '../test-utils'
import type { CookedResult, CookPreview } from '../types'
import { useMarkCooked } from './useMarkCooked'
import { usePlanActions } from './usePlanActions'
import { useStockCorrection } from './useStockCorrection'

const key = { date: '2026-11-09', mealSlotId: 2 }

const preview: CookPreview = {
  meal: { date: '2026-11-09', mealSlotId: 2, recipeId: 7, recipeName: 'Chicken', batches: 1, portions: 2, state: 'planned', pinned: false, servedFromLeftover: null, why: [] },
  fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-12', needs: [],
}

const cooked: CookedResult = {
  meal: { ...preview.meal, state: 'cooked', pinned: true },
  leftover: { id: 3, recipeId: 7, recipeName: 'Chicken', portions: 2.5, cookedOn: '2026-11-09', useBy: '2026-11-12', fromDate: '2026-11-09', fromMealSlotId: 2 },
  warnings: [
    { ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 400, shortfall: 100, message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g' },
    { ingredientId: 13, name: 'rice', baseUnit: 'g', have: 0, need: 250, shortfall: 250, message: 'Stock shows no rice, the recipe uses 250 g' },
  ],
  plannedFor: [{ date: '2026-11-10', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Chicken' }],
}

describe('useMarkCooked', () => {
  it('stays idle without a slot', () => {
    const api = mockApi({})
    const { result } = renderHook(() => useMarkCooked(null), { wrapper })
    expect(result.current.preview).toBeNull()
    expect(api.calls).toHaveLength(0)
  })

  it('loads the preview and starts the Leftover at the proposal', async () => {
    mockApi({ 'GET /api/plan/2026-11-09/2/cook': preview })
    const { result } = renderHook(() => useMarkCooked(key), { wrapper })
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    expect(result.current.leftover).toBe(2)
  })

  it('confirms with the edited portions and exposes the warnings, which can be dismissed one by one', async () => {
    const api = mockApi({ 'GET /api/plan/2026-11-09/2/cook': preview, 'POST /api/plan/2026-11-09/2/cooked': cooked })
    const { result } = renderHook(() => useMarkCooked(key), { wrapper })
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    act(() => result.current.setLeftover(2.5))
    let res: CookedResult | null = null
    await act(async () => {
      res = await result.current.confirm()
    })
    expect(res).toEqual(cooked)
    expect(api.callsTo('POST', '/api/plan/2026-11-09/2/cooked')[0]?.body).toEqual({ leftoverPortions: 2.5 })
    expect(result.current.warnings.map((w) => w.ingredientId)).toEqual([11, 13])
    act(() => result.current.dismissWarning(11))
    expect(result.current.warnings.map((w) => w.ingredientId)).toEqual([13])
  })

  it('B13: exposes where the Leftover went once Mark as Cooked succeeded', async () => {
    mockApi({ 'GET /api/plan/2026-11-09/2/cook': preview, 'POST /api/plan/2026-11-09/2/cooked': cooked })
    const { result } = renderHook(() => useMarkCooked(key), { wrapper })
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    expect(result.current.outcome).toBeNull()
    await act(async () => {
      await result.current.confirm()
    })
    expect(result.current.outcome).toEqual({
      kind: 'planned', portions: 2.5, useBy: '2026-11-12', meals: [{ date: '2026-11-10', mealSlotName: 'Dinner', recipeName: 'Chicken' }],
    })
  })

  it('a failed confirmation reports it and keeps the sheet usable', async () => {
    mockApi({
      'GET /api/plan/2026-11-09/2/cook': preview,
      'POST /api/plan/2026-11-09/2/cooked': { status: 500, json: { error: { code: 'internal', message: 'boom' } } },
    })
    const { result } = renderHook(() => useMarkCooked(key), { wrapper })
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    let res: CookedResult | null = cooked
    await act(async () => {
      res = await result.current.confirm()
    })
    expect(res).toBeNull()
    expect(result.current.error).toBe('That could not be saved. Nothing was changed.')
    expect(result.current.busy).toBe(false)
  })

  it('Not cooked posts to not-cooked', async () => {
    const api = mockApi({ 'GET /api/plan/2026-11-09/2/cook': preview, 'POST /api/plan/2026-11-09/2/not-cooked': { ...preview.meal, state: 'skipped' } })
    const { result } = renderHook(() => useMarkCooked(key), { wrapper })
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    let ok = false
    await act(async () => {
      ok = await result.current.notCooked()
    })
    expect(ok).toBe(true)
    expect(api.callsTo('POST', '/api/plan/2026-11-09/2/not-cooked')).toHaveLength(1)
  })
})

describe('usePlanActions', () => {
  it('Regenerate posts and toggles the busy flag', async () => {
    const api = mockApi({ 'POST /api/plan/regenerate': undefined })
    const { result } = renderHook(() => usePlanActions(), { wrapper })
    await act(async () => {
      await result.current.regenerate()
    })
    expect(api.callsTo('POST', '/api/plan/regenerate')).toHaveLength(1)
    expect(result.current.regenerating).toBe(false)
  })

  it('setMeal puts the Recipe on the slot', async () => {
    const api = mockApi({ 'PUT /api/plan/2026-11-10/3': { ...preview.meal, pinned: true } })
    const { result } = renderHook(() => usePlanActions(), { wrapper })
    await act(async () => {
      await result.current.setMeal({ date: '2026-11-10', mealSlotId: 3 }, 9)
    })
    expect(api.callsTo('PUT', '/api/plan/2026-11-10/3')[0]?.body).toEqual({ recipeId: 9 })
  })

  it('confirm and unpin post to their routes', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/3/confirm': preview.meal, 'POST /api/plan/2026-11-10/3/unpin': preview.meal })
    const { result } = renderHook(() => usePlanActions(), { wrapper })
    await act(async () => {
      await result.current.confirm({ date: '2026-11-10', mealSlotId: 3 })
      await result.current.unpin({ date: '2026-11-10', mealSlotId: 3 })
    })
    expect(api.calls.map((c) => c.path)).toEqual(['/api/plan/2026-11-10/3/confirm', '/api/plan/2026-11-10/3/unpin'])
  })

  it('keeps the message of a failed action', async () => {
    mockApi({ 'PUT /api/plan/2026-11-10/3': { status: 422, json: { error: { code: 'recipe_archived', message: 'The Recipe is archived' } } } })
    const { result } = renderHook(() => usePlanActions(), { wrapper })
    await act(async () => {
      await result.current.setMeal({ date: '2026-11-10', mealSlotId: 3 }, 9).catch(() => {})
    })
    await waitFor(() => expect(result.current.error).toBe('The Recipe is archived'))
  })
})

describe('useStockCorrection', () => {
  it('sets the Stock total through T10 and reports success', async () => {
    const api = mockApi({ 'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] } })
    const { result } = renderHook(() => useStockCorrection(), { wrapper })
    let ok = false
    await act(async () => {
      ok = await result.current.correct(11, 250)
    })
    expect(ok).toBe(true)
    expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 250 })
  })

  it('reports a failure without throwing', async () => {
    mockApi({ 'PUT /api/stock/ingredients/11/total': { status: 422, json: { error: { code: 'validation_failed', message: 'negative' } } } })
    const { result } = renderHook(() => useStockCorrection(), { wrapper })
    let ok = true
    await act(async () => {
      ok = await result.current.correct(11, -1)
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe('negative')
  })
})

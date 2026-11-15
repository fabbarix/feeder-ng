// B9-45 (PC-05): the Get ready list's data: each Recipe's lines, Stock Lots and Storage Places, scaled by the Batches cooked.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../plan/test-utils'
import { useGetReady } from './useGetReady'

afterEach(() => vi.unstubAllGlobals())

const recipe = (id: number, name: string, lines: unknown[], yieldN = 4) => ({ id, name, yield: yieldN, lines })
const chicken = { ingredientId: 1, ingredient: 'Chicken', quantity: 1200, unit: 'g', optional: false, note: '' }
const rice = { ingredientId: 2, ingredient: 'Rice', quantity: 300, unit: 'g', optional: false, note: '' }
const lots = { today: '2026-11-09', lots: [{ id: 1, ingredientId: 1, quantity: 900, goesOff: '2026-11-12', spoiled: false, storagePlaceId: 2 }] }
const places = [{ id: 2, name: 'Fridge', kind: 'fridge', default: false }]
const source = { recipeId: 7, recipeName: 'Roast chicken', batches: 1 }
const routes = (extra: Record<string, unknown> = {}) => ({
  'GET /api/recipes/7': recipe(7, 'Roast chicken', [chicken, rice]),
  'GET /api/stock/lots': lots,
  'GET /api/storage-places': places,
  ...extra,
})

describe('useGetReady', () => {
  it('is loading, then has the rows of the Recipe with the Storage Place of the soonest Lot', async () => {
    mockApi(routes())
    const { result } = renderHook(() => useGetReady([source], 2.75), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.available).toBe(true)
    expect(result.current.sections).toHaveLength(1)
    expect(result.current.sections[0]!.rows.map((r) => [r.name, r.amount, r.place])).toEqual([['Chicken', '1.2 kg', 'Fridge'], ['Rice', '300 g', null]])
    expect(result.current.meta).toBe('For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover')
    expect(result.current.context).toBe('Roast chicken · 2.75 portions')
  })

  it('scales by the Batches and, for a Recipe cook, by its Yield', async () => {
    mockApi(routes())
    const { result } = renderHook(() => useGetReady([{ ...source, batches: 2 }], null), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.sections[0]!.rows.map((r) => r.amount)).toEqual(['2.4 kg', '600 g'])
    expect(result.current.meta).toBe('For 8 portions: 2 Batches of 4 portions')
    expect(result.current.context).toBe('Roast chicken · 8 portions')
  })

  it('reads each Course\'s Recipe once for a timeline and groups them by Course', async () => {
    const api = mockApi(routes({ 'GET /api/recipes/8': recipe(8, 'Green beans', [{ ...rice, ingredientId: 3, ingredient: 'Beans', quantity: 400 }]) }))
    const { result } = renderHook(
      () => useGetReady([{ ...source, courseId: 1, courseName: 'Main' }, { recipeId: 8, recipeName: 'Green beans', batches: 1, courseId: 2, courseName: 'Side' }], 4),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.sections.map((s) => s.title)).toEqual(['Main · Roast chicken', 'Side · Green beans'])
    expect(api.callsTo('GET', '/api/recipes/7')).toHaveLength(1)
    expect(api.callsTo('GET', '/api/recipes/8')).toHaveLength(1)
  })

  it('is not available when the Recipe cannot be read (Cook Mode opens on Step 1, as before)', async () => {
    mockApi(routes({ 'GET /api/recipes/7': { status: 500, json: { error: { code: 'x', message: 'no' } } } }))
    const { result } = renderHook(() => useGetReady([source], 2), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.available).toBe(false)
  })

  it('is not available for a Recipe with no Ingredient lines', async () => {
    mockApi(routes({ 'GET /api/recipes/7': recipe(7, 'Toast', []) }))
    const { result } = renderHook(() => useGetReady([source], 1), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.available).toBe(false)
  })

  it('still lists the Ingredients, without a Storage Place, when Stock or the places cannot be read', async () => {
    mockApi(routes({ 'GET /api/stock/lots': { status: 500, json: { error: { code: 'x', message: 'no' } } } }))
    const { result } = renderHook(() => useGetReady([source], 2), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.available).toBe(true)
    expect(result.current.sections[0]!.rows.map((r) => r.place)).toEqual([null, null])
  })
})

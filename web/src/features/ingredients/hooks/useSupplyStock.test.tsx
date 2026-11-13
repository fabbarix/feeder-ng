// H9: the Supplies list joins GET /api/stock totals (kind "supply" rows) to the Supplies by id; no new list endpoint.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../../lib/baseRecipes/test-utils'

vi.mock('./useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { useSupplyStock } from './useSupplyStock'

const total = (over: Record<string, unknown>) => ({
  ingredientId: 22, name: 'toilet paper', baseUnit: 'piece', total: 4, lotCount: 1, nextGoesOff: null, useSoon: false, spoiledCount: 0, imageUrl: '', kind: 'supply', ...over,
})

afterEach(() => vi.unstubAllGlobals())

describe('useSupplyStock', () => {
  it('has no totals until Stock is loaded', () => {
    mockApi({ 'GET /api/stock': { ingredients: [] } })
    const { result } = renderHook(() => useSupplyStock(), { wrapper })
    expect(result.current.totals).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })
  it('maps each Supply to its total from GET /api/stock and leaves food out', async () => {
    const api = mockApi({
      'GET /api/stock': { ingredients: [total({}), total({ ingredientId: 21, name: 'dish soap', baseUnit: 'ml', total: 800 }), total({ ingredientId: 7, name: 'milk', baseUnit: 'ml', total: 1000, kind: 'food' })] },
    })
    const { result } = renderHook(() => useSupplyStock(), { wrapper })
    await waitFor(() => expect(result.current.totals).not.toBeNull())
    expect(Object.fromEntries(result.current.totals ?? [])).toEqual({ 22: 4, 21: 800 })
    expect(result.current.isLoading).toBe(false)
    expect(api.callsTo('GET', '/api/stock')).toHaveLength(1)
  })
  it('has an empty map, not null, when no Supply has Stock', async () => {
    mockApi({ 'GET /api/stock': { ingredients: [] } })
    const { result } = renderHook(() => useSupplyStock(), { wrapper })
    await waitFor(() => expect(result.current.totals).not.toBeNull())
    expect(result.current.totals?.size).toBe(0)
  })
  it('reports an error and keeps the totals null when Stock fails to load', async () => {
    mockApi({ 'GET /api/stock': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const { result } = renderHook(() => useSupplyStock(), { wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.totals).toBeNull()
  })
})

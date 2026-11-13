import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, wrapper } from '../../../lib/baseRecipes/test-utils'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
import { useBaseRecipeStock } from './useBaseRecipeStock'

// BR-D round 4: a Base recipe's Stock through the Stock API, by baseIngredientId.
const row = (over = {}) => ({ ingredientId: 30, name: 'Béchamel', baseUnit: 'ml', total: 300, lotCount: 1, nextGoesOff: null, useSoon: false, spoiledCount: 0, ...over })

describe('useBaseRecipeStock', () => {
  it('finds the Ingredient\'s row in GET /api/stock and words it', async () => {
    mockApi({ 'GET /api/stock': { ingredients: [row({ ingredientId: 9, total: 5 }), row()] } })
    const { result } = renderHook(() => useBaseRecipeStock(30), { wrapper })
    expect(result.current.line).toBeNull() // not known yet: never a wrong "none"
    await waitFor(() => expect(result.current.line).toBe('In the Pantry: 300 ml'))
  })
  it('"none" once Stock has loaded and holds none of it', async () => {
    mockApi({ 'GET /api/stock': { ingredients: [] } })
    const { result } = renderHook(() => useBaseRecipeStock(30), { wrapper })
    await waitFor(() => expect(result.current.line).toBe('In the Pantry: none'))
  })
  it('stays null when Stock cannot be loaded', async () => {
    const api = mockApi({ 'GET /api/stock': refusal(500, 'internal') })
    const { result } = renderHook(() => useBaseRecipeStock(30), { wrapper })
    await waitFor(() => expect(api.callsTo('GET', '/api/stock')).toHaveLength(1))
    expect(result.current.line).toBeNull()
  })
  it('asks for nothing without an Ingredient (a plannable Recipe)', async () => {
    const api = mockApi({})
    const { result } = renderHook(() => useBaseRecipeStock(undefined), { wrapper })
    expect(result.current.line).toBeNull()
    expect(api.calls).toEqual([])
  })
})

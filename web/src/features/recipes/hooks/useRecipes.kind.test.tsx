import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, summaryJSON, wrapper } from '../../../lib/baseRecipes/test-utils'
import { useRecipes } from './useRecipes'

// BR-D: GET /api/recipes?kind=base returns Base recipe summaries (baseRecipe, yieldUnit, usedByCount).
describe('useRecipes with a kind', () => {
  it('lists Base recipes and keeps their order (no Last cooked re-sort)', async () => {
    const api = mockApi({
      'GET /api/recipes?kind=base&archived=no': [summaryJSON({ id: 2, name: 'Roux', usedByCount: 1 }), summaryJSON({ id: 1, name: 'Béchamel', usedByCount: 3 })],
      'GET /api/tags': [],
    })
    const { result } = renderHook(() => useRecipes({ kind: 'base', archived: 'no' }), { wrapper })
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
    expect(result.current.recipes.map((r) => r.name)).toEqual(['Roux', 'Béchamel'])
    expect(result.current.recipes[1]).toMatchObject({ baseRecipe: true, yieldUnit: 'l', usedByCount: 3 })
    expect(api.callsTo('GET', '/api/recipes?kind=base&archived=no')).toHaveLength(1)
  })
  it('is empty (not "no match") when there are no Base recipes at all and no filter', async () => {
    mockApi({ 'GET /api/recipes?kind=base&archived=no': [], 'GET /api/tags': [] })
    const { result } = renderHook(() => useRecipes({ kind: 'base', archived: 'no' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEmpty).toBe(true)
  })
})

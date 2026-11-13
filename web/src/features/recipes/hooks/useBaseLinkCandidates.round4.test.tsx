import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { candidateJSON, mockApi, wrapper } from '../../../lib/baseRecipes/test-utils'
import * as hooks from './useBaseLinkCandidates'

// BR-D round 4: the candidates answer carries the Base Unit; the detail never reads the Ingredient for it.
describe('useBaseLinkCandidates', () => {
  it('returns the distinct Recipes, the Ingredient name and the baseUnit of the answer', async () => {
    mockApi({ 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [candidateJSON({ lineId: 1, recipeId: 10 }), candidateJSON({ lineId: 2, recipeId: 10 }), candidateJSON({ lineId: 3, recipeId: 11 })] } })
    const { result } = renderHook(() => hooks.useBaseLinkCandidates(3, true), { wrapper })
    await waitFor(() => expect(result.current.count).toBe(2))
    expect(result.current.ingredientName).toBe('béchamel')
    expect(result.current.baseUnit).toBe('ml')
  })
  it('has no baseUnit until the answer is in (never a guessed unit)', () => {
    mockApi({})
    const { result } = renderHook(() => hooks.useBaseLinkCandidates(3, true), { wrapper })
    expect(result.current.baseUnit).toBeUndefined()
  })
  it('no longer exports the Ingredient lookup of the unit', () => {
    expect('useBaseIngredientUnit' in hooks).toBe(false)
  })
})

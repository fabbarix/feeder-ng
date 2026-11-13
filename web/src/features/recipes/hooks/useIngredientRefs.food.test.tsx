// H5: the Recipe line picker's Ingredient refs come from ?kind=food, and share no cache entry with the other kinds.
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, wrapper } from '../../../lib/baseRecipes/test-utils'
import { useIngredientRefs } from './useIngredientRefs'

const garlic = { id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30, frozenShelfLifeDays: null, conversions: [{ unit: 'clove', toBase: 5 }], image: '', imageUrl: '', baseRecipe: null, kind: 'food', restockLevel: null }

describe('useIngredientRefs', () => {
  it('fetches food only, and never the unfiltered list', async () => {
    const api = mockApi({ 'GET /api/ingredients?kind=food': [garlic] })
    const { result } = renderHook(() => useIngredientRefs(), { wrapper })
    await waitFor(() => expect(result.current.byId.get(7)?.name).toBe('garlic'))
    expect(api.calls.map((c) => c.path)).toEqual(['/api/ingredients?kind=food'])
  })
})

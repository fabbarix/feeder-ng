// BR-E: the bulk link queue after Confirm (design §13): one sheet per Base recipe the import created or converted, nothing ticked.
// The sheet needs the Base recipe's Ingredient (for a merge), which the Confirm answer does not carry: GET /api/recipes/{id}.baseIngredientId.
// RED until hooks/useImportFollowUps.ts exists.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, summaryJSON, wrapper } from '../../../lib/baseRecipes/test-utils'
import { applied, confirmed } from '../fixtures.baseRecipes.test-helper'
import { useImportFollowUps } from './useImportFollowUps'

const result = confirmed([
  applied({ index: 0, id: 10, name: 'Lasagne' }),
  applied({ index: 1, id: 3, name: 'Béchamel', baseRecipe: true }),
  applied({ index: 2, id: 4, name: 'Pesto', baseRecipe: true, action: 'converted' }),
])

describe('useImportFollowUps', () => {
  it('queues nothing without a result, or for plannable Recipes only', () => {
    mockApi({})
    expect(renderHook(() => useImportFollowUps(undefined), { wrapper }).result.current.target).toBeNull()
    expect(renderHook(() => useImportFollowUps(confirmed([applied()])), { wrapper }).result.current.target).toBeNull()
  })

  it('offers the first Base recipe with its Ingredient, then the next, then nothing', async () => {
    const api = mockApi({
      'GET /api/recipes/3': summaryJSON({ id: 3, name: 'Béchamel', baseIngredientId: 30 }),
      'GET /api/recipes/4': summaryJSON({ id: 4, name: 'Pesto', baseIngredientId: 40 }),
    })
    const { result: hook } = renderHook(() => useImportFollowUps(result), { wrapper })
    await waitFor(() => expect(hook.current.target).toEqual({ id: 3, name: 'Béchamel', ingredientId: 30 }))
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([]) // asking links nothing
    act(() => hook.current.next())
    await waitFor(() => expect(hook.current.target).toEqual({ id: 4, name: 'Pesto', ingredientId: 40 }))
    act(() => hook.current.next())
    expect(hook.current.target).toBeNull()
  })

  it('counts what is left, the current one included', async () => {
    mockApi({ 'GET /api/recipes/3': summaryJSON({ id: 3, baseIngredientId: 30 }), 'GET /api/recipes/4': summaryJSON({ id: 4, baseIngredientId: 40 }) })
    const { result: hook } = renderHook(() => useImportFollowUps(result), { wrapper })
    await waitFor(() => expect(hook.current.target).not.toBeNull())
    expect(hook.current.remaining).toBe(2)
    act(() => hook.current.next())
    expect(hook.current.remaining).toBe(1)
  })

  it('skips a Base recipe whose detail cannot be read, and goes on with the next', async () => {
    mockApi({ 'GET /api/recipes/4': summaryJSON({ id: 4, name: 'Pesto', baseIngredientId: 40 }) })
    const { result: hook } = renderHook(() => useImportFollowUps(result), { wrapper })
    await waitFor(() => expect(hook.current.target).toEqual({ id: 4, name: 'Pesto', ingredientId: 40 }))
  })
})

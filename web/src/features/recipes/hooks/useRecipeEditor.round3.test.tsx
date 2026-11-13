import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, wrapper } from '../../../lib/baseRecipes/test-utils'
import { recipe } from '../fixtures.test-helper'
import { useRecipeEditor } from './useRecipeEditor'

// BR-D round 3: an editor save keeps the remembered Ingredient of a Base recipe line (the PUT replaces the lines).
describe('useRecipeEditor save keeps the remembered Ingredient', () => {
  it('PUTs the line id and linkedFromIngredientId of an untouched Base recipe line', async () => {
    const stored = recipe({
      id: 2, name: 'Lasagne',
      lines: [{ id: 12, ingredientId: 30, ingredient: 'Béchamel', quantity: 500, unit: 'ml', optional: false, note: '', baseRecipe: { id: 3, name: 'Béchamel', archived: false }, neededAtStep: null, linkedFromIngredientId: 5 }],
    })
    const api = mockApi({ 'GET /api/recipes/2': stored, 'GET /api/slot-rules': [], 'GET /api/meal-slots': [], 'PUT /api/recipes/2': stored })
    const { result } = renderHook(() => useRecipeEditor(2), { wrapper })
    await waitFor(() => expect(result.current.draft.name).toBe('Lasagne'))
    act(() => result.current.setDraft((d) => ({ ...d, description: 'edited' })))
    await act(async () => { await result.current.save() })
    const line = (api.callsTo('PUT', '/api/recipes/2')[0]?.body as { lines: Array<Record<string, unknown>> }).lines[0]
    expect(line).toMatchObject({ id: 12, baseRecipeId: 3, linkedFromIngredientId: 5 })
  })
})

describe('useRecipeEditor storedKind', () => {
  it('is null for a new Recipe, plannable or base for a stored one', async () => {
    mockApi({})
    expect(renderHook(() => useRecipeEditor(), { wrapper }).result.current.storedKind).toBeNull()
    const base = recipe({ id: 2, name: 'Béchamel', baseRecipe: true, yieldUnit: 'l', courses: [], baseIngredientId: 30, usedBy: [], within: [] })
    mockApi({ 'GET /api/recipes/2': base, 'GET /api/slot-rules': [], 'GET /api/meal-slots': [] })
    const { result } = renderHook(() => useRecipeEditor(2), { wrapper })
    await waitFor(() => expect(result.current.storedKind).toBe('base'))
    mockApi({ 'GET /api/recipes/3': recipe({ id: 3 }), 'GET /api/slot-rules': [], 'GET /api/meal-slots': [] })
    const plain = renderHook(() => useRecipeEditor(3), { wrapper })
    await waitFor(() => expect(plain.result.current.storedKind).toBe('plannable'))
  })
})

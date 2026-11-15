// B9-48 (SET-05): useIngredient grows save(patch): ONE PATCH with all the Keeping values (the server's PATCH takes them together:
// patchBody in internal/ingredient/httpapi), then the detail and the lists refresh. The single setters stay for their other callers.
// And useIngredientImpact(id, enabled): the impact read of SAFE-02, only fetched when asked (the Delete confirm opens).
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, refusal, wrapper } from '../../../lib/baseRecipes/test-utils'
import { detail, garlicJSON } from '../supply.test-helper'
import { useIngredient } from './useIngredient'
import { useIngredientImpact } from './useIngredientImpact'

describe('useIngredient.save', () => {
  const load = async (routes: Record<string, unknown> = {}) => {
    const api = mockApi({ 'GET /api/ingredients/7': detail(garlicJSON), ...routes })
    const hook = renderHook(() => useIngredient(7), { wrapper })
    await waitFor(() => expect(hook.result.current.ingredient?.id).toBe(7))
    return { ...hook, api }
  }
  it('sends both Shelf Lives in one PATCH and refreshes the detail', async () => {
    const { result, api } = await load({ 'PATCH /api/ingredients/7': { ...garlicJSON, shelfLifeDays: 10, frozenShelfLifeDays: 90 } })
    await act(() => result.current.save({ shelfLifeDays: 10, frozenShelfLifeDays: 90 }))
    const patches = api.callsTo('PATCH', '/api/ingredients/7')
    expect(patches).toHaveLength(1)
    expect(patches[0]?.body).toEqual({ shelfLifeDays: 10, frozenShelfLifeDays: 90 })
    await waitFor(() => expect(api.callsTo('GET', '/api/ingredients/7').length).toBeGreaterThan(1))
  })
  it('rejects with the server refusal, for the form to word', async () => {
    const { result } = await load({ 'PATCH /api/ingredients/7': refusal(422, 'validation_failed', { reason: 'supply_has_shelf_life' }) })
    await expect(result.current.save({ shelfLifeDays: 3 })).rejects.toMatchObject({ status: 422, code: 'validation_failed' })
  })
})

describe('useIngredientImpact', () => {
  it('does not read anything until enabled', async () => {
    const api = mockApi({ 'GET /api/ingredients/7/impact': { references: {}, total: 0 } })
    const { result } = renderHook(() => useIngredientImpact(7, false), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.calls).toHaveLength(0)
    expect(result.current.impact).toBeUndefined()
  })
  it('reads GET /api/ingredients/{id}/impact once enabled', async () => {
    const api = mockApi({ 'GET /api/ingredients/7/impact': { references: { products: 1 }, total: 1 } })
    const { result } = renderHook(() => useIngredientImpact(7, true), { wrapper })
    await waitFor(() => expect(result.current.impact).toEqual({ references: { products: 1 }, total: 1 }))
    expect(api.callsTo('GET', '/api/ingredients/7/impact')).toHaveLength(1)
  })
  it('a failed read leaves impact undefined (the confirm still opens, without its claim)', async () => {
    mockApi({ 'GET /api/ingredients/7/impact': refusal(500, 'server_error') })
    const { result } = renderHook(() => useIngredientImpact(7, true), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.impact).toBeUndefined()
  })
})

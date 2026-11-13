// H5: the one-Ingredient hook: Restock level and kind changes (PATCH), refusals pass through for the page to word.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { mockApi, refusal, wrapper } from '../../../lib/baseRecipes/test-utils'
import { detail, dishSoapJSON, kindInUse } from '../supply.test-helper'
import { useIngredient } from './useIngredient'

const load = async (routes: Record<string, unknown> = {}) => {
  const api = mockApi({ 'GET /api/ingredients/21': detail(dishSoapJSON), ...routes })
  const hook = renderHook(() => useIngredient(21), { wrapper })
  await waitFor(() => expect(hook.result.current.ingredient?.kind).toBe('supply'))
  return { ...hook, api }
}

describe('useIngredient: Restock level', () => {
  it('reads kind and restockLevel from the detail', async () => {
    const { result } = await load()
    expect(result.current.ingredient?.restockLevel).toBe(500)
  })
  it('PATCHes { restockLevel } in Base Units', async () => {
    const { result, api } = await load({ 'PATCH /api/ingredients/21': { ...dishSoapJSON, restockLevel: 750 } })
    await act(() => result.current.setRestockLevel(750))
    expect(api.callsTo('PATCH', '/api/ingredients/21')[0]?.body).toEqual({ restockLevel: 750 })
  })
  it('PATCHes { restockLevel: null } to clear it', async () => {
    const { result, api } = await load({ 'PATCH /api/ingredients/21': { ...dishSoapJSON, restockLevel: null } })
    await act(() => result.current.setRestockLevel(null))
    expect(api.callsTo('PATCH', '/api/ingredients/21')[0]?.body).toEqual({ restockLevel: null })
  })
  it('rejects with the 422 restock_level_on_food ApiError', async () => {
    const { result } = await load({ 'PATCH /api/ingredients/21': refusal(422, 'validation_failed', { reason: 'restock_level_on_food' }) })
    await expect(result.current.setRestockLevel(5)).rejects.toMatchObject({ status: 422, code: 'validation_failed', details: { reason: 'restock_level_on_food' } })
  })
})

describe('useIngredient: kind', () => {
  it('PATCHes { kind } and refreshes the detail and both lists', async () => {
    const { result, api } = await load({ 'PATCH /api/ingredients/21': { ...dishSoapJSON, kind: 'food', restockLevel: null } })
    await act(() => result.current.setKind('food'))
    expect(api.callsTo('PATCH', '/api/ingredients/21')[0]?.body).toEqual({ kind: 'food' })
    await waitFor(() => expect(api.callsTo('GET', '/api/ingredients/21').length).toBeGreaterThan(1))
  })
  it('rejects with the 409 kind_in_use ApiError carrying its reasons', async () => {
    const { result } = await load({ 'PATCH /api/ingredients/21': kindInUse(['recipe_lines', 'base_recipe']) })
    const error = await result.current.setKind('food').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('kind_in_use')
    expect((error as ApiError).details.reasons).toEqual(['recipe_lines', 'base_recipe'])
  })
})

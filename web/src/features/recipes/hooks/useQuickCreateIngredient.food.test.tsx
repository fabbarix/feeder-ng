// H5: quick create from a Recipe line always makes food, whatever the sheet sent, and looks for near duplicates among food.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ingredientsApi } from '../../ingredients/api'
import { garlicJSON } from '../../ingredients/supply.test-helper'
import { useQuickCreateIngredient } from './useQuickCreateIngredient'

vi.mock('../../ingredients/api', () => ({ ingredientsApi: { create: vi.fn(), search: vi.fn() } }))
const api = vi.mocked(ingredientsApi)
const client = new QueryClient()
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

beforeEach(() => vi.resetAllMocks())

describe('useQuickCreateIngredient: food only', () => {
  it('creates with kind food even if the body says Supply, and drops a Restock level', async () => {
    api.create.mockResolvedValue(garlicJSON)
    const { result } = renderHook(() => useQuickCreateIngredient({ pick: vi.fn() }), { wrapper })
    await act(async () => {
      await result.current.create({ name: 'soap', baseUnit: 'ml', kind: 'supply', restockLevel: 500 })
    })
    expect(api.create).toHaveBeenCalledWith({ name: 'soap', baseUnit: 'ml', kind: 'food' })
  })
  it('refreshes every Ingredient list (both kinds share the "ingredients" key prefix)', async () => {
    api.create.mockResolvedValue(garlicJSON)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useQuickCreateIngredient({ pick: vi.fn() }), { wrapper })
    await act(async () => {
      await result.current.create({ name: 'garlic', baseUnit: 'g' })
    })
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['ingredients'] }))
  })
})

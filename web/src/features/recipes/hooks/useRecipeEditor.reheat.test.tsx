import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import type { Recipe } from '../types'
import { useRecipeEditor } from './useRecipeEditor'
import { recipe } from '../fixtures.test-helper'

vi.mock('../api', () => ({
  recipesApi: { create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn() },
}))
const api = vi.mocked(recipesApi)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const line = { key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' }
const saved = { id: 11, name: 'Aioli' } as Recipe

beforeEach(() => vi.resetAllMocks())

describe('useRecipeEditor: reheat time (R12)', () => {
  it('saves the typed reheat time with the Recipe', async () => {
    api.create.mockResolvedValue(saved)
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Aioli', yield: '4', lines: [line], reheatMinutes: '5' })))
    await act(async () => {
      await result.current.save()
    })
    expect(api.create.mock.calls[0]![0]).toMatchObject({ name: 'Aioli', reheatMinutes: 5 })
  })

  it('a blank field is saved as null (no reheat time)', async () => {
    api.create.mockResolvedValue(saved)
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Aioli', yield: '4', lines: [line] })))
    await act(async () => {
      await result.current.save()
    })
    expect(api.create.mock.calls[0]![0]).toMatchObject({ reheatMinutes: null })
  })

  it('does not call the API for a reheat time outside 1 to 30 minutes', async () => {
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Aioli', yield: '4', lines: [line], reheatMinutes: '99' })))
    await act(async () => {
      await result.current.save()
    })
    expect(result.current.errors).toMatchObject({ reheatMinutes: 'reheat_invalid' })
    expect(api.create).not.toHaveBeenCalled()
  })

  it('shows a server reheat_invalid on the field', async () => {
    api.create.mockRejectedValue(new ApiError(422, 'validation_failed', 'Reheat', { field: 'reheatMinutes', reason: 'reheat_invalid' }))
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Aioli', yield: '4', lines: [line], reheatMinutes: '5' })))
    await act(async () => {
      await result.current.save()
    })
    expect(result.current.errors.reheatMinutes).toBe('reheat_invalid')
  })

  it('opening a stored Recipe fills the field', async () => {
    api.get.mockResolvedValue(recipe({ id: 3, reheatMinutes: 6 }))
    const { result } = renderHook(() => useRecipeEditor(3), { wrapper })
    await waitFor(() => expect(result.current.draft.reheatMinutes).toBe('6'))
  })
})

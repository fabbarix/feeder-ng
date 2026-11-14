// b8-recipes: the Tags filter of the Recipes list (docs/dev/design/b8-recipes.md 3.4).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recipesApi } from '../api'
import { summary } from '../fixtures.test-helper'
import { useRecipes } from './useRecipes'

vi.mock('../api', () => ({ recipesApi: { list: vi.fn(), tags: vi.fn() } }))
vi.mock('./useRecipeLiveUpdates', () => ({ useRecipeLiveUpdates: () => undefined }))
const api = vi.mocked(recipesApi)
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

beforeEach(() => {
  vi.resetAllMocks()
  api.tags.mockResolvedValue([])
})

describe('useRecipes with Tags', () => {
  it('passes every Tag to the list call', async () => {
    api.list.mockResolvedValue([summary()])
    const { result } = renderHook(() => useRecipes({ tags: ['fish', 'oven'] }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.list).toHaveBeenCalledWith({ tags: ['fish', 'oven'] })
  })
  it('an empty answer under Tags is "no match", not "no Recipes at all"', async () => {
    api.list.mockResolvedValue([])
    const { result } = renderHook(() => useRecipes({ tags: ['fish', 'oven'] }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEmpty).toBe(false)
  })
  it('an empty Tag list is no filter: an empty answer is "no Recipes at all"', async () => {
    api.list.mockResolvedValue([])
    const { result } = renderHook(() => useRecipes({ tags: [] }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEmpty).toBe(true)
  })
})

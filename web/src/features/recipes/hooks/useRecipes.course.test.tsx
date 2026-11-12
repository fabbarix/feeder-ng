// CRS E2: the Course filter of the Recipes list (docs/dev/design/crs-e2.md 5).
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

describe('useRecipes with a Course', () => {
  it('passes the Course to the list call', async () => {
    api.list.mockResolvedValue([summary()])
    const { result } = renderHook(() => useRecipes({ course: 2 }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.list).toHaveBeenCalledWith({ course: 2 })
  })
  it('an empty answer under a Course filter is "no match", not "no Recipes at all"', async () => {
    api.list.mockResolvedValue([])
    const { result } = renderHook(() => useRecipes({ course: 2 }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.recipes).toEqual([])
    expect(result.current.isEmpty).toBe(false)
  })
  it('keeps one cache entry per Course', async () => {
    api.list.mockResolvedValue([summary()])
    const { result, rerender } = renderHook(({ c }) => useRecipes({ course: c }), { wrapper, initialProps: { c: 1 } })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    rerender({ c: 2 })
    await waitFor(() => expect(api.list).toHaveBeenCalledWith({ course: 2 }))
  })
})

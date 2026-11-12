// Beta.5 F7: useRecipes takes the sort in its filter and sorts with the same pure rule as the server.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recipesApi } from '../api'
import { summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'
import { useRecipes } from './useRecipes'

vi.mock('../api', () => ({ recipesApi: { list: vi.fn(), tags: vi.fn() } }))
vi.mock('./useRecipeLiveUpdates', () => ({ useRecipeLiveUpdates: () => undefined }))
const api = vi.mocked(recipesApi)
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const rows = [
  summary({ id: 1, name: 'Chilli', lastCookedOn: '2026-11-08' }),
  summary({ id: 2, name: 'Borscht', lastCookedOn: null }),
  summary({ id: 3, name: 'Apple pie', lastCookedOn: '2026-10-01' }),
]
const names = (l: { name: string }[]) => l.map((r) => r.name)

beforeEach(() => {
  vi.resetAllMocks()
  api.tags.mockResolvedValue([])
})

describe('useRecipes with a sort', () => {
  it('passes the sort to the list call', async () => {
    api.list.mockResolvedValue(rows)
    const { result } = renderHook(() => useRecipes({ sort: 'last_cooked_asc' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.list).toHaveBeenCalledWith({ sort: 'last_cooked_asc' })
  })
  it('puts the Recipes in the sort order whatever order the answer had (a live update may bring a new date)', async () => {
    api.list.mockResolvedValue(rows)
    const asc = renderHook(() => useRecipes({ sort: 'last_cooked_asc' }), { wrapper })
    await waitFor(() => expect(asc.result.current.isLoading).toBe(false))
    expect(names(asc.result.current.recipes)).toEqual(['Borscht', 'Apple pie', 'Chilli'])
    const desc = renderHook(() => useRecipes({ sort: 'last_cooked_desc' }), { wrapper })
    await waitFor(() => expect(desc.result.current.isLoading).toBe(false))
    expect(names(desc.result.current.recipes)).toEqual(['Chilli', 'Apple pie', 'Borscht'])
  })
  it('sorts by name for the name sort', async () => {
    api.list.mockResolvedValue(rows)
    const { result } = renderHook(() => useRecipes({ sort: 'name' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(names(result.current.recipes)).toEqual(['Apple pie', 'Borscht', 'Chilli'])
  })
  it('keeps the answer as it came when there is no sort', async () => {
    api.list.mockResolvedValue(rows)
    const { result } = renderHook(() => useRecipes({}), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(names(result.current.recipes)).toEqual(['Chilli', 'Borscht', 'Apple pie'])
  })
  it('a sort alone is not a filter: an empty answer still means "no Recipes at all"', async () => {
    api.list.mockResolvedValue([])
    const { result } = renderHook(() => useRecipes({ sort: 'last_cooked_desc' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEmpty).toBe(true)
  })
  it('asks again when the sort changes (one cache entry per sort)', async () => {
    api.list.mockResolvedValue(rows)
    const { result, rerender } = renderHook(({ f }: { f: RecipeFilter }) => useRecipes(f), { wrapper, initialProps: { f: { sort: 'name' } as RecipeFilter } })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    rerender({ f: { sort: 'last_cooked_desc' } })
    await waitFor(() => expect(api.list).toHaveBeenCalledWith({ sort: 'last_cooked_desc' }))
  })
})

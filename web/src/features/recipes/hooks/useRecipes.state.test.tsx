import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/providers'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import { summary } from '../fixtures.test-helper'
import { useRecipes } from './useRecipes'

// B9-20 (RES-02): useRecipes returns a `state` from dataState. "Unknown is not empty."
vi.mock('../api', () => ({ recipesApi: { list: vi.fn(), tags: vi.fn() } }))
vi.mock('./useRecipeLiveUpdates', () => ({ useRecipeLiveUpdates: () => undefined }))
const api = vi.mocked(recipesApi)
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>

beforeEach(() => {
  vi.resetAllMocks()
  api.tags.mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
  window.dispatchEvent(new Event('online'))
})

describe('useRecipes().state', () => {
  it('loading, then ready', async () => {
    api.list.mockResolvedValue([summary()])
    const { result } = renderHook(() => useRecipes({}), { wrapper })
    expect(result.current.state).toBe('loading')
    await waitFor(() => expect(result.current.state).toBe('ready'))
  })

  it('a successful empty answer with no filter is empty', async () => {
    api.list.mockResolvedValue([])
    const { result } = renderHook(() => useRecipes({}), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('empty'))
  })

  it('a successful empty answer under a search or a Tag is filteredEmpty, not empty', async () => {
    api.list.mockResolvedValue([])
    const a = renderHook(() => useRecipes({ q: 'lasagne' }), { wrapper })
    await waitFor(() => expect(a.result.current.state).toBe('filteredEmpty'))
    const b = renderHook(() => useRecipes({ tags: ['fish'] }), { wrapper })
    await waitFor(() => expect(b.result.current.state).toBe('filteredEmpty'))
  })

  it('offline with nothing ever loaded is offlineUnknown, never empty or filteredEmpty (even with a search word)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    api.list.mockRejectedValue(new ApiError(0, 'network', 'The network is unreachable'))
    const { result } = renderHook(() => useRecipes({ q: 'lasagne' }), { wrapper })
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))))
    expect(result.current.state).toBe('offlineUnknown')
    expect(result.current.recipes).toEqual([])
    expect(result.current.isEmpty).toBe(false)
  })

  it('online and the request keeps failing is failed', async () => {
    vi.useFakeTimers()
    api.list.mockRejectedValue(new ApiError(500, 'internal', 'x'))
    const { result } = renderHook(() => useRecipes({}), { wrapper })
    await act(async () => void (await vi.advanceTimersByTimeAsync(1500)))
    expect(result.current.state).toBe('failed')
    vi.useRealTimers()
  })

  it('offline with the Recipes already loaded is offlineSaved, with the Recipes', async () => {
    api.list.mockResolvedValue([summary({ name: 'Pancakes' })])
    const client = createQueryClient()
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useRecipes({}), { wrapper: w })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      window.dispatchEvent(new Event('offline'))
    })
    await waitFor(() => expect(result.current.state).toBe('offlineSaved'))
    expect(result.current.recipes.map((r) => r.name)).toEqual(['Pancakes'])
  })

  it('a failed refetch over loaded Recipes keeps them: ready, not failed', async () => {
    api.list.mockResolvedValueOnce([summary({ name: 'Pancakes' })])
    const client = createQueryClient()
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useRecipes({}), { wrapper: w })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    api.list.mockRejectedValue(new ApiError(404, 'x', 'x'))
    await act(async () => void (await client.refetchQueries({ queryKey: ['recipes'] })))
    expect(result.current.state).toBe('ready')
    expect(result.current.recipes).toHaveLength(1)
  })
})

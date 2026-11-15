import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/providers'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import { recipe } from '../fixtures.test-helper'
import { useRecipe } from './useRecipe'

// B9-20 (RES-02): the Recipe detail's `state`. A missing Recipe is failed at once; offline and never loaded is offlineUnknown.
vi.mock('../api', () => ({ recipesApi: { get: vi.fn() } }))
vi.mock('./useRecipeLiveUpdates', () => ({ useRecipeLiveUpdates: () => undefined }))
const api = vi.mocked(recipesApi)
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>

beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  vi.restoreAllMocks()
  window.dispatchEvent(new Event('online'))
})

describe('useRecipe().state', () => {
  it('ready with the Recipe', async () => {
    api.get.mockResolvedValue(recipe())
    const { result } = renderHook(() => useRecipe(3), { wrapper })
    expect(result.current.state).toBe('loading')
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.recipe?.id).toBe(3)
  })

  it('a 404 is failed after one request', async () => {
    api.get.mockRejectedValue(new ApiError(404, 'not_found', 'x'))
    const { result } = renderHook(() => useRecipe(99999), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('failed'))
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('offline and never loaded is offlineUnknown, not failed', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    api.get.mockRejectedValue(new ApiError(0, 'network', 'x'))
    const { result } = renderHook(() => useRecipe(3), { wrapper })
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))))
    expect(result.current.state).toBe('offlineUnknown')
    expect(result.current.recipe).toBeUndefined()
  })
})

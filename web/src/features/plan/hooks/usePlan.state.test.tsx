import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/providers'
import { ApiError } from '../../../lib/http'

// B9-20 (RES-02): usePlan returns `state` from dataState; features/plan/hooks/queryFailed.ts is replaced by it.
const api = vi.hoisted(() => ({ view: vi.fn() }))
vi.mock('../api', () => ({ planApi: api }))
vi.mock('./usePlanLiveUpdates', () => ({ usePlanLiveUpdates: () => undefined }))
import { usePlan } from './usePlan'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
afterEach(() => {
  vi.restoreAllMocks()
  window.dispatchEvent(new Event('online'))
})

describe('usePlan().state', () => {
  it('loading, then ready', async () => {
    api.view.mockResolvedValue({ today: '2026-11-14', slots: [], updating: false })
    const { result } = renderHook(() => usePlan(), { wrapper })
    expect(result.current.state).toBe('loading')
    await waitFor(() => expect(result.current.state).toBe('ready'))
  })

  it('offline and never loaded: offlineUnknown, and `failed` is false (it is not an error)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    api.view.mockRejectedValue(new ApiError(0, 'network', 'x'))
    const { result } = renderHook(() => usePlan(), { wrapper })
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))))
    expect(result.current.state).toBe('offlineUnknown')
    expect(result.current.failed).toBe(false)
  })

  it('online, a 500 that stays: failed, with `failed` true for the screens not yet moved to `state`', async () => {
    vi.useFakeTimers()
    api.view.mockRejectedValue(new ApiError(500, 'internal', 'x'))
    const { result } = renderHook(() => usePlan(), { wrapper })
    await act(async () => void (await vi.advanceTimersByTimeAsync(1500)))
    expect(result.current.state).toBe('failed')
    expect(result.current.failed).toBe(true)
    vi.useRealTimers()
  })
})

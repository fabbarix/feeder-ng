import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retryPolicy } from '../lib/dataState'
import { ApiError } from '../lib/http'
import { createQueryClient } from './providers'

// B9-20 (RES-02, RES-06): the app's query policy. offlineFirst; one retry after 1 s for 5xx, timeout and network; none for 4xx.
describe('createQueryClient defaults', () => {
  it('queries are offlineFirst with the shared retry policy and a 1 s delay; mutations are offlineFirst and never retried', () => {
    const d = createQueryClient().getDefaultOptions()
    expect(d.queries).toMatchObject({ networkMode: 'offlineFirst', retry: retryPolicy, retryDelay: 1000 })
    expect(d.mutations).toMatchObject({ networkMode: 'offlineFirst', retry: 0 })
  })
})

describe('the policy at work', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const run = (fn: () => Promise<unknown>) => {
    const client = createQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    return renderHook(() => useQuery({ queryKey: ['t'], queryFn: fn }), { wrapper })
  }
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

  it('a 500 fails after one retry: the error shows at about 1 s (two requests), not after 7 s', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError(500, 'internal', 'x'))
    const { result } = run(fn)
    await advance(900)
    expect(result.current.isError).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1)
    await advance(200)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.isError).toBe(true)
    await advance(10_000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('a 404 is an error at once, with one request', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError(404, 'not_found', 'x'))
    const { result } = run(fn)
    await advance(0)
    expect(result.current.isError).toBe(true)
    await advance(5000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a network error (status 0) is retried once', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError(0, 'network', 'x'))
    const { result } = run(fn)
    await advance(1200)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.isError).toBe(true)
  })

  it('a retry that succeeds gives the data and no error', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new ApiError(503, 'x', 'x')).mockResolvedValue(['ok'])
    const { result } = run(fn)
    await advance(1200)
    expect(result.current.data).toEqual(['ok'])
    expect(result.current.isError).toBe(false)
  })

  it('offline, the query function runs once (offlineFirst): a saved-copy fallback can answer; no data is not an error that retries', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    const fn = vi.fn().mockResolvedValue(['saved copy'])
    const { result } = run(fn)
    await advance(0)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(['saved copy'])
    window.dispatchEvent(new Event('online'))
  })

  it('offline with a failing query function: one run, the retry waits for the connection, and when it returns the data fills in', async () => {
    window.dispatchEvent(new Event('offline'))
    const fn = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network', 'x')).mockResolvedValue(['fresh'])
    const { result } = run(fn)
    await advance(5000)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBeUndefined()
    expect(result.current.fetchStatus).toBe('paused')
    window.dispatchEvent(new Event('online'))
    await advance(1500)
    expect(result.current.data).toEqual(['fresh'])
  })
})

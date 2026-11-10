import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveRefresh, liveRefreshFor, LIVE_REFRESH_WINDOW_MS } from './liveRefresh'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createLiveRefresh', () => {
  it('collapses a burst of requests into one invalidation at the end of the window', () => {
    const invalidate = vi.fn()
    const r = createLiveRefresh(invalidate, 250)
    r.request()
    r.request()
    vi.advanceTimersByTime(100)
    r.request()
    expect(invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(invalidate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('the window is measured from the first request, so a steady stream still refreshes', () => {
    const invalidate = vi.fn()
    const r = createLiveRefresh(invalidate, 250)
    for (let i = 0; i < 10; i++) {
      r.request()
      vi.advanceTimersByTime(100)
    }
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('a request after the window starts a new burst', () => {
    const invalidate = vi.fn()
    const r = createLiveRefresh(invalidate, 250)
    r.request()
    vi.advanceTimersByTime(250)
    r.request()
    vi.advanceTimersByTime(250)
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('cancel drops the pending request', () => {
    const invalidate = vi.fn()
    const r = createLiveRefresh(invalidate, 250)
    r.request()
    r.cancel()
    vi.advanceTimersByTime(1000)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('defaults to a 250 ms window', () => {
    expect(LIVE_REFRESH_WINDOW_MS).toBe(250)
  })
})

describe('liveRefreshFor', () => {
  it('is shared per QueryClient and invalidates ["shopping"] once, without cancelling a request in flight', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
    liveRefreshFor(client).request()
    liveRefreshFor(client).request()
    expect(liveRefreshFor(client)).toBe(liveRefreshFor(client))
    vi.advanceTimersByTime(LIVE_REFRESH_WINDOW_MS)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['shopping'] }, { cancelRefetch: false })
  })

  it('does not share between clients', () => {
    expect(liveRefreshFor(new QueryClient())).not.toBe(liveRefreshFor(new QueryClient()))
  })
})

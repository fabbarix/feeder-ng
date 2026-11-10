import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { createMemoryOpStore, OfflineQueue } from '../lib/queue'
import type { Op, ScanResult } from '../types'
import { useSyncQueue } from './useSyncQueue'

const op = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 })

function setup(online: boolean) {
  const queue = new OfflineQueue(createMemoryOpStore())
  const state = { online }
  const sync = vi.fn(async (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult))
  const onResults = vi.fn()
  const hook = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => state.online, onResults }))
  return { queue, state, sync, onResults, hook }
}

describe('useSyncQueue', () => {
  it('keeps scans while offline and counts them', async () => {
    const { hook, sync } = setup(false)
    await act(() => hook.result.current.enqueue(op('a')))
    await act(() => hook.result.current.enqueue(op('b')))
    expect(hook.result.current.pendingCount).toBe(2)
    expect(hook.result.current.online).toBe(false)
    expect(sync).not.toHaveBeenCalled()
  })

  it('sends the queue, in order, when the window comes back online', async () => {
    const { hook, state, sync, onResults } = setup(false)
    await act(() => hook.result.current.enqueue(op('a')))
    await act(() => hook.result.current.enqueue(op('b')))
    state.online = true
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    expect(sync.mock.calls[0]?.[0].map((o) => o.clientUuid)).toEqual(['a', 'b'])
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
    expect(onResults).toHaveBeenCalledTimes(1)
    expect(onResults.mock.calls[0]?.[0].map((r: ScanResult) => r.status)).toEqual(['applied', 'applied'])
    expect(hook.result.current.online).toBe(true)
  })

  it('sends at once when online', async () => {
    const { hook, sync } = setup(true)
    await act(() => hook.result.current.enqueue(op('a')))
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    expect(hook.result.current.pendingCount).toBe(0)
  })

  it('flushes what an earlier session left in the queue when it mounts online', async () => {
    const store = createMemoryOpStore()
    const queue = new OfflineQueue(store)
    await queue.enqueue(op('left-over'))
    const sync = vi.fn(async (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult))
    renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => true }))
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
  })

  it('passes a merge notice on', async () => {
    const queue = new OfflineQueue(createMemoryOpStore())
    const merged: ScanResult = {
      clientUuid: 'a',
      status: 'applied',
      scan: { ingredientId: 1, ingredientName: 'x', baseUnit: 'g', productId: 50, productName: 'Tomatoes', quantity: 1, lotId: 1, priceCents: null, onList: false, remaining: 0, ticked: false, productCreated: false, merged: { productId: 50, productName: 'Tomatoes' } },
    }
    const onResults = vi.fn()
    const { result } = renderHook(() => useSyncQueue({ queue, api: { sync: async () => [merged] }, isOnline: () => true, onResults }))
    await act(() => result.current.enqueue(op('a')))
    await waitFor(() => expect(onResults).toHaveBeenCalled())
    expect(onResults.mock.calls[0]?.[1]).toEqual([expect.objectContaining({ kind: 'merged', clientUuid: 'a' })])
  })

  it('counts rejected operations separately', async () => {
    const queue = new OfflineQueue(createMemoryOpStore())
    const sync = async (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'rejected', error: { code: 'unknown_product', message: 'gone' } }) as ScanResult)
    const { result } = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => true }))
    await act(() => result.current.enqueue(op('a')))
    await waitFor(() => expect(result.current.rejectedCount).toBe(1))
    expect(result.current.pendingCount).toBe(0)
  })

  it('dismissing the rejected operations resets their count and leaves what is still waiting alone', async () => {
    const queue = new OfflineQueue(createMemoryOpStore())
    const sync = async (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'rejected', error: { code: 'unknown_product', message: 'gone' } }) as ScanResult)
    const { result } = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => true }))
    await act(() => result.current.enqueue(op('a')))
    await waitFor(() => expect(result.current.rejectedCount).toBe(1))
    await act(() => result.current.dismissRejected())
    expect(result.current.rejectedCount).toBe(0)
    expect(await queue.rejected()).toEqual([])
  })

  it('a scan enqueued while a send is in flight is sent right after it, not left waiting while online', async () => {
    const queue = new OfflineQueue(createMemoryOpStore())
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    let calls = 0
    const sync = vi.fn(async (ops: Op[]) => {
      calls += 1
      if (calls === 1) await gate
      return ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult)
    })
    const { result } = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => true }))
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.enqueue(op('a'))
    })
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    let second: Promise<void> = Promise.resolve()
    act(() => {
      second = result.current.enqueue(op('b'))
    })
    await waitFor(() => expect(result.current.pendingCount).toBe(2)) // b is queued; a's send is still in flight
    release()
    await act(async () => {
      await Promise.all([first, second])
    })
    expect(sync).toHaveBeenCalledTimes(2)
    expect(sync.mock.calls[1]?.[0].map((o) => o.clientUuid)).toEqual(['b'])
    expect(result.current.pendingCount).toBe(0)
  })

  it('cancel passes the queue answer on: false for a scan the server applied', async () => {
    const { hook } = setup(true)
    await act(() => hook.result.current.enqueue(op('a')))
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
    expect(await hook.result.current.cancel('a')).toBe(false)
  })
})

describe('useSyncQueue retries', () => {
  afterEach(() => vi.useRealTimers())

  const unavailable = () => new ApiError(503, 'http_error', 'unavailable')

  it('retries with growing waits while online after a server error, and stops once the queue is sent', async () => {
    vi.useFakeTimers()
    const queue = new OfflineQueue(createMemoryOpStore())
    const sync = vi
      .fn<(ops: Op[]) => Promise<ScanResult[]>>()
      .mockRejectedValueOnce(unavailable())
      .mockRejectedValueOnce(unavailable())
      .mockImplementation(async (ops) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult))
    const { result } = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => true }))
    const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

    await act(async () => void (await result.current.enqueue(op('a'))))
    expect(sync).toHaveBeenCalledTimes(1)
    expect(result.current.pendingCount).toBe(1)
    await advance(999)
    expect(sync).toHaveBeenCalledTimes(1)
    await advance(1) // 1 s after the first failure
    expect(sync).toHaveBeenCalledTimes(2)
    await advance(1999)
    expect(sync).toHaveBeenCalledTimes(2)
    await advance(1) // 2 s after the second
    expect(sync).toHaveBeenCalledTimes(3)
    expect(result.current.pendingCount).toBe(0)
    await advance(120_000)
    expect(sync).toHaveBeenCalledTimes(3)
  })

  it('does not retry while the phone is offline', async () => {
    vi.useFakeTimers()
    const queue = new OfflineQueue(createMemoryOpStore())
    const state = { online: true }
    const sync = vi.fn<(ops: Op[]) => Promise<ScanResult[]>>().mockRejectedValue(unavailable())
    const { result } = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => state.online }))
    await act(async () => void (await result.current.enqueue(op('a'))))
    expect(sync).toHaveBeenCalledTimes(1)
    state.online = false
    await act(async () => void (await vi.advanceTimersByTimeAsync(120_000)))
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('stops retrying when the screen goes away', async () => {
    vi.useFakeTimers()
    const queue = new OfflineQueue(createMemoryOpStore())
    const sync = vi.fn<(ops: Op[]) => Promise<ScanResult[]>>().mockRejectedValue(unavailable())
    const { result, unmount } = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => true }))
    await act(async () => void (await result.current.enqueue(op('a'))))
    unmount()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sync).toHaveBeenCalledTimes(1)
  })
})

// B9-54 (RES-03, "useSyncQueue is lifted ... mounted once under the shell, so Shop and Scan share it"): one queue per app. Two consumers see the
// same waiting Ops; a Tick queued by the Shop and a Scan queued by Scan are one order, one batch; results reach every subscriber; without a
// provider a screen still works on its own queue.
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryOpStore, OfflineQueue } from '../lib/queue'
import type { Op, ScanResult } from '../types'
import { SyncQueueProvider, useSharedSyncQueue } from './SyncQueueProvider'

const scan = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 })
const tick = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:01:00Z', kind: 'shop_tick', shopId: 1, ingredientId: 9, rangeTo: '2026-11-15', quantity: 50, covers: 150 })
const ok = async (ops: Op[]): Promise<ScanResult[]> => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult)

function setup(online = false) {
  const queue = new OfflineQueue(createMemoryOpStore())
  const state = { online }
  const sync = vi.fn(ok)
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <SyncQueueProvider queue={queue} api={{ sync }} isOnline={() => state.online}>
      {children}
    </SyncQueueProvider>
  )
  return { queue, state, sync, wrapper }
}

describe('SyncQueueProvider', () => {
  it('two consumers share one queue: what the Shop queues, Scan sees waiting (and the count is the same)', async () => {
    const { wrapper } = setup()
    const shop = renderHook(() => useSharedSyncQueue(), { wrapper })
    const scanScreen = renderHook(() => useSharedSyncQueue(), { wrapper })
    await act(() => shop.result.current.enqueue(tick('t-1')))
    await waitFor(() => expect(scanScreen.result.current.pendingOps.map((o) => o.clientUuid)).toEqual(['t-1']))
    expect(scanScreen.result.current.pendingCount).toBe(1)
  })

  it('both consumers inside ONE provider share it (one hook tree)', async () => {
    const { wrapper } = setup()
    const both = renderHook(() => ({ shop: useSharedSyncQueue(), scan: useSharedSyncQueue() }), { wrapper })
    await act(() => both.result.current.shop.enqueue(tick('t-1')))
    await act(() => both.result.current.scan.enqueue(scan('s-1')))
    expect(both.result.current.shop.pendingOps.map((o) => o.clientUuid)).toEqual(['t-1', 's-1'])
    expect(both.result.current.scan.pendingOps.map((o) => o.clientUuid)).toEqual(['t-1', 's-1'])
  })

  it('a Tick and a Scan queued by different screens go in one batch, in the order made, when the phone is back online', async () => {
    const { wrapper, state, sync } = setup()
    const a = renderHook(() => useSharedSyncQueue(), { wrapper })
    await act(() => a.result.current.enqueue(tick('t-1')))
    await act(() => a.result.current.enqueue(scan('s-1')))
    state.online = true
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    expect(sync.mock.calls[0]![0].map((o) => o.clientUuid)).toEqual(['t-1', 's-1'])
  })

  it('subscribe: every subscriber hears the results, notices and sent Ops of a flush, until it unsubscribes', async () => {
    const { wrapper } = setup(true)
    const hook = renderHook(() => useSharedSyncQueue(), { wrapper })
    const first = vi.fn()
    const second = vi.fn()
    let off = () => {}
    act(() => {
      off = hook.result.current.subscribe(first)
      hook.result.current.subscribe(second)
    })
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1))
    expect(second).toHaveBeenCalledTimes(1)
    const [results, notices, sent] = first.mock.calls[0]!
    expect(results.map((r: ScanResult) => r.clientUuid)).toEqual(['t-1'])
    expect(notices).toEqual([])
    expect(sent.map((o: Op) => o.kind)).toEqual(['shop_tick'])
    off()
    await act(() => hook.result.current.enqueue(tick('t-2')))
    await waitFor(() => expect(second).toHaveBeenCalledTimes(2))
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('without a provider a screen still has a queue of its own (online: false until told otherwise by the browser)', async () => {
    const hook = renderHook(() => useSharedSyncQueue())
    expect(typeof hook.result.current.enqueue).toBe('function')
    expect(typeof hook.result.current.subscribe).toBe('function')
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
  })
})

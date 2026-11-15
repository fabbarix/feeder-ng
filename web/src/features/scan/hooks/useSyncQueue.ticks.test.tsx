// B9-54 (RES-03): useSyncQueue carries Ticks too. New in its result: `pendingOps` and `rejectedOps` (the Ops themselves, in order, so the Shop
// can draw its waiting and refused rows), `updateQueuedTick(clientUuid, quantity)` (Change while waiting), and a third argument to
// `onResults`: the Ops the flush sent. Notices never read a Tick result as a Scan.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryOpStore, OfflineQueue } from '../lib/queue'
import type { Op, ScanResult } from '../types'
import { useSyncQueue } from './useSyncQueue'

const scan = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 })
const tick = (uuid: string, quantity = 50): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:01:00Z', kind: 'shop_tick', shopId: 1, ingredientId: 9, rangeTo: '2026-11-15', quantity, covers: 150 })
const ok = (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult)

function setup(online: boolean, syncImpl: (ops: Op[]) => Promise<ScanResult[]> = async (ops) => ok(ops)) {
  const queue = new OfflineQueue(createMemoryOpStore())
  const state = { online }
  const sync = vi.fn(syncImpl)
  const onResults = vi.fn()
  const hook = renderHook(() => useSyncQueue({ queue, api: { sync }, isOnline: () => state.online, onResults }))
  return { queue, state, sync, onResults, hook }
}

describe('useSyncQueue: the waiting Ops', () => {
  it('pendingOps lists the Ticks and Scans waiting, in the order they were made, and the count follows', async () => {
    const { hook } = setup(false)
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await act(() => hook.result.current.enqueue(scan('s-1')))
    await act(() => hook.result.current.enqueue(tick('t-2', 20)))
    expect(hook.result.current.pendingOps.map((o) => `${o.kind}:${o.clientUuid}`)).toEqual(['shop_tick:t-1', 'shop_scan:s-1', 'shop_tick:t-2'])
    expect(hook.result.current.pendingCount).toBe(3)
  })

  it('back online they go in ONE batch in that order, and pendingOps empties', async () => {
    const { hook, state, sync } = setup(false)
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await act(() => hook.result.current.enqueue(scan('s-1')))
    state.online = true
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    expect(sync.mock.calls[0]![0].map((o) => o.clientUuid)).toEqual(['t-1', 's-1'])
    await waitFor(() => expect(hook.result.current.pendingOps).toEqual([]))
  })

  it('onResults hears the Ops the flush sent as its third argument', async () => {
    const { hook, onResults } = setup(true)
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1))
    const [results, , sent] = onResults.mock.calls[0]!
    expect(results.map((r: ScanResult) => r.clientUuid)).toEqual(['t-1'])
    expect(sent.map((o: Op) => `${o.kind}:${o.clientUuid}`)).toEqual(['shop_tick:t-1'])
  })

  it('a refused Tick is in rejectedOps with its Op until dismissed, and makes no Scan notice', async () => {
    const refuse = async (ops: Op[]): Promise<ScanResult[]> => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'rejected', error: { code: 'not_on_list', message: 'gone' } }))
    const { hook, onResults } = setup(true, refuse)
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await waitFor(() => expect(hook.result.current.rejectedOps.map((o) => o.clientUuid)).toEqual(['t-1']))
    expect(hook.result.current.rejectedOps[0]).toMatchObject({ kind: 'shop_tick', ingredientId: 9, quantity: 50 })
    expect(onResults.mock.calls[0]![1]).toEqual([])
    await act(() => hook.result.current.dismissRejected())
    expect(hook.result.current.rejectedOps).toEqual([])
  })
})

describe('useSyncQueue: Change and Undo of a waiting Tick', () => {
  it('updateQueuedTick rewrites the waiting amount and the hook shows it', async () => {
    const { hook } = setup(false)
    await act(() => hook.result.current.enqueue(tick('t-1')))
    let changed = false
    await act(async () => {
      changed = await hook.result.current.updateQueuedTick('t-1', 120)
    })
    expect(changed).toBe(true)
    expect(hook.result.current.pendingOps[0]).toMatchObject({ clientUuid: 't-1', quantity: 120 })
  })

  it('updateQueuedTick of a Tick that is not waiting is false', async () => {
    const { hook } = setup(false)
    let changed = true
    await act(async () => {
      changed = await hook.result.current.updateQueuedTick('nope', 120)
    })
    expect(changed).toBe(false)
  })

  it('cancel removes a waiting Tick: nothing is ever sent for it', async () => {
    const { hook, state, sync } = setup(false)
    await act(() => hook.result.current.enqueue(tick('t-1')))
    await act(() => hook.result.current.enqueue(scan('s-1')))
    let serverHasNothing = false
    await act(async () => {
      serverHasNothing = await hook.result.current.cancel('t-1')
    })
    expect(serverHasNothing).toBe(true)
    expect(hook.result.current.pendingOps.map((o) => o.clientUuid)).toEqual(['s-1'])
    state.online = true
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    expect(sync.mock.calls[0]![0].map((o) => o.clientUuid)).toEqual(['s-1'])
  })
})

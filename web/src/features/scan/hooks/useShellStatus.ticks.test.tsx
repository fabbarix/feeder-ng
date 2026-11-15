// B9-54 (RES-03): the shell's status counts the Ticks waiting in the queue apart from the Scans, for the banner line "2 Scans and 1 Tick waiting
// to sync" (B9-49's overlayStrings.queueWaiting(scans, ticks) and its `pendingTicks`). A shop_tick or shop_untick is a Tick; every other kind is
// a Scan. Same triggers as before: on mount, on a queue change, online/offline and visibility.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMemoryOpStore, type QueuedOp } from '../lib/queue'
import { withChangeEvents } from '../lib/queueEvents'
import type { Op } from '../types'
import { useShellStatus } from './useShellStatus'

const entry = (op: Op): QueuedOp => ({ op, queuedAt: '2026-11-09T12:00:01Z', attempts: 0 })
const scan = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 })
const tick = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_tick', shopId: 1, ingredientId: 9, rangeTo: '2026-11-15', quantity: 50, covers: 150 })
const untick = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_untick', tickClientUuid: 't-1' })

describe('useShellStatus counts Ticks apart from Scans', () => {
  it('2 Scans and 1 Tick', async () => {
    const store = withChangeEvents(createMemoryOpStore())
    await store.append(entry(scan('s-1')))
    await store.append(entry(tick('t-1')))
    await store.append(entry(scan('s-2')))
    const { result } = renderHook(() => useShellStatus(store))
    await waitFor(() => expect(result.current).toEqual({ pendingScans: 2, pendingTicks: 1 }))
  })

  it('an untick waiting is a Tick too; a Stock-take and a new-Product scan stay Scans', async () => {
    const store = withChangeEvents(createMemoryOpStore())
    await store.append(entry(untick('u-1')))
    await store.append(entry({ clientUuid: 'k-1', scannedAt: '2026-11-09T12:00:00Z', kind: 'stock_take', action: 'plus_pack' }))
    await store.append(entry({ clientUuid: 'n-1', scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_unknown' }))
    const { result } = renderHook(() => useShellStatus(store))
    await waitFor(() => expect(result.current).toEqual({ pendingScans: 2, pendingTicks: 1 }))
  })

  it('follows the queue on every screen: a Tick queued by the Shop shows, and goes when it syncs or Undo removes it', async () => {
    const store = withChangeEvents(createMemoryOpStore())
    const { result } = renderHook(() => useShellStatus(store))
    await waitFor(() => expect(result.current.pendingTicks).toBe(0))
    await act(() => store.append(entry(tick('t-1'))))
    await waitFor(() => expect(result.current.pendingTicks).toBe(1))
    expect(result.current.pendingScans).toBe(0)
    await act(() => store.remove('t-1'))
    await waitFor(() => expect(result.current.pendingTicks).toBe(0))
  })

  it('counts 0 Ticks where the store cannot be read', async () => {
    const broken = { ...createMemoryOpStore(), all: async () => { throw new Error('no IndexedDB') } }
    const { result } = renderHook(() => useShellStatus(broken))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current).toEqual({ pendingScans: 0, pendingTicks: 0 })
  })
})

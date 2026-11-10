import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMemoryOpStore, type QueuedOp } from '../lib/queue'
import { withChangeEvents } from '../lib/queueEvents'
import { useShellStatus } from './useShellStatus'
import * as scanFeature from '../index'

const entry = (uuid: string): QueuedOp => ({ op: { clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 }, queuedAt: '2026-11-09T12:00:01Z', attempts: 0 })

describe('useShellStatus (the WP5 extension point)', () => {
  it('is exported from the Scan feature so collectFeatures picks it up', () => {
    expect(scanFeature.useShellStatus).toBe(useShellStatus)
  })

  it('counts the scans waiting in the persisted queue', async () => {
    const store = withChangeEvents(createMemoryOpStore())
    await store.append(entry('a'))
    await store.append(entry('b'))
    const { result } = renderHook(() => useShellStatus(store))
    await waitFor(() => expect(result.current).toEqual({ pendingScans: 2 }))
  })

  it('follows the queue when a scan is queued or synced, without a Scan screen being open', async () => {
    const store = withChangeEvents(createMemoryOpStore())
    const { result } = renderHook(() => useShellStatus(store))
    await waitFor(() => expect(result.current.pendingScans).toBe(0))
    await act(() => store.append(entry('a')))
    await waitFor(() => expect(result.current.pendingScans).toBe(1))
    await act(() => store.remove('a'))
    await waitFor(() => expect(result.current.pendingScans).toBe(0))
  })

  it('re-reads when the phone goes back online', async () => {
    const plain = createMemoryOpStore()
    const { result } = renderHook(() => useShellStatus(plain))
    await waitFor(() => expect(result.current.pendingScans).toBe(0))
    await plain.append(entry('a'))
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(result.current.pendingScans).toBe(1))
  })

  it('counts 0 where the store cannot be read', async () => {
    const broken = { ...createMemoryOpStore(), all: async () => { throw new Error('no IndexedDB') } }
    const { result } = renderHook(() => useShellStatus(broken))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.pendingScans).toBe(0)
  })
})

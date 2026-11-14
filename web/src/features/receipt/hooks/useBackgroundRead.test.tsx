// b8-rxweb: useBackgroundRead(shopId?) is the store as React state (docs/dev/design/b8-rxweb.md).
// Pinned API of ./useBackgroundRead:
//   useBackgroundRead(shopId?: number): BackgroundRead | undefined
//   The state of the one read, or undefined; given a shopId, only a read of THAT Shop (a Scanned list belongs to its Shop). Re-renders on every change.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))

import { resetBackgroundRead, startBackgroundRead } from '../lib/backgroundRead'
import { forgetRead } from '../lib/readStore'
import { POLL_INTERVAL_MS } from '../lib/readPolling'
import { useBackgroundRead } from './useBackgroundRead'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetBackgroundRead()
  forgetRead()
  api.startRead.mockResolvedValue({ id: 'rd-1' })
  api.getRead.mockResolvedValue({ status: 'running' })
})
afterEach(() => {
  resetBackgroundRead()
  vi.useRealTimers()
})

describe('useBackgroundRead', () => {
  it('follows the read from reading to ready', async () => {
    const { result } = renderHook(() => useBackgroundRead(SHOP_ID))
    expect(result.current).toBeUndefined()
    await act(async () => { await startBackgroundRead({ shopId: SHOP_ID, clientUuids: UUIDS }, [{ dataUrl: 'data:,x' }]) })
    expect(result.current).toMatchObject({ status: 'reading', readId: 'rd-1' })
    api.getRead.mockResolvedValue(readDone())
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    expect(result.current).toMatchObject({ status: 'ready', readId: 'rd-1' })
  })

  it('shows a read of another Shop to nobody who asks for this Shop', async () => {
    const mine = renderHook(() => useBackgroundRead(SHOP_ID))
    const other = renderHook(() => useBackgroundRead(SHOP_ID + 1))
    const any = renderHook(() => useBackgroundRead())
    await act(async () => { await startBackgroundRead({ shopId: SHOP_ID, clientUuids: UUIDS }, [{ dataUrl: 'data:,x' }]) })
    expect(mine.result.current).toBeDefined()
    expect(other.result.current).toBeUndefined()
    expect(any.result.current).toBeDefined()
  })
})

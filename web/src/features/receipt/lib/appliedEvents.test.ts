// RR4: the hand-over of an apply's results to the Scanned session. The Scan screen subscribes (integration wires it to SR3's
// settle / reprice); the review screen emits, then navigates to /scan, so an event emitted before the Scan screen mounts waits for it.
// Pinned API of ./appliedEvents:
//   emitReceiptApplied(event: ReceiptAppliedEvent): void   to every subscriber; with none, kept as pending
//   takePendingReceiptApplied(): ReceiptAppliedEvent | undefined   the pending one, once
//   subscribeReceiptApplied(listener): () => void
// Pinned API of ../hooks/useReceiptApplied:
//   useReceiptApplied(handler: (e: ReceiptAppliedEvent) => void): void   delivers a pending event on mount, then every new one; handler may change between renders
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitReceiptApplied, subscribeReceiptApplied, takePendingReceiptApplied } from './appliedEvents'
import { useReceiptApplied } from '../hooks/useReceiptApplied'
import type { ReceiptAppliedEvent } from '../types'
import { scanResult } from '../fixtures.test-helper'

const ok: ReceiptAppliedEvent = { readId: 'rd-1', applied: 2, failed: false, results: [scanResult('receipt:rd-1:0')] }
const failed: ReceiptAppliedEvent = { readId: 'rd-1', applied: 0, failed: true, results: [scanResult('receipt:rd-1:undo:u2')] }

afterEach(() => {
  takePendingReceiptApplied()
})

describe('emitReceiptApplied', () => {
  it('reaches every subscriber and is not kept as pending', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeReceiptApplied(a)
    const offB = subscribeReceiptApplied(b)
    emitReceiptApplied(ok)
    expect(a).toHaveBeenCalledWith(ok)
    expect(b).toHaveBeenCalledWith(ok)
    expect(takePendingReceiptApplied()).toBeUndefined()
    offA()
    offB()
  })
  it('with nobody listening, waits as pending and is taken once', () => {
    emitReceiptApplied(failed)
    expect(takePendingReceiptApplied()).toEqual(failed)
    expect(takePendingReceiptApplied()).toBeUndefined()
  })
  it('an unsubscribed listener hears nothing', () => {
    const a = vi.fn()
    subscribeReceiptApplied(a)()
    emitReceiptApplied(ok)
    expect(a).not.toHaveBeenCalled()
    takePendingReceiptApplied()
  })
})

describe('useReceiptApplied', () => {
  it('delivers a pending event when the Scan screen mounts', () => {
    emitReceiptApplied(ok)
    const handler = vi.fn()
    renderHook(() => useReceiptApplied(handler))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(ok)
    expect(takePendingReceiptApplied()).toBeUndefined()
  })
  it('delivers an event emitted while mounted', () => {
    const handler = vi.fn()
    renderHook(() => useReceiptApplied(handler))
    emitReceiptApplied(failed)
    expect(handler).toHaveBeenCalledWith(failed)
  })
  it('stops listening on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useReceiptApplied(handler))
    unmount()
    emitReceiptApplied(ok)
    expect(handler).not.toHaveBeenCalled()
  })
  it('calls the latest handler without resubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ h }) => useReceiptApplied(h), { initialProps: { h: first } })
    rerender({ h: second })
    emitReceiptApplied(ok)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

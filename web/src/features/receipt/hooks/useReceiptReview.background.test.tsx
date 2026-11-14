// b8-rxweb: the review keeps the Scan screen's row honest. Wherever the review forgets the kept read it also dismisses the background state,
// so the row goes back to "Read the receipt" (docs/dev/design/b8-rxweb.md 4). A refused apply that leaves the read kept leaves the row "ready".
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { takePendingReceiptApplied } from '../lib/appliedEvents'
import { forgetRead, recallRead } from '../lib/readStore'
import { publishReceiptSession } from '../lib/receiptSession'
import { readDone, READ_ID, scanResult, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: false } }) }))

import { getBackgroundRead, resetBackgroundRead, startBackgroundRead } from '../lib/backgroundRead'
import { POLL_INTERVAL_MS } from '../lib/readPolling'
import { useReceiptReview } from './useReceiptReview'

async function readyRead() {
  api.startRead.mockResolvedValue({ id: READ_ID })
  api.getRead.mockResolvedValue(readDone())
  await startBackgroundRead({ shopId: SHOP_ID, clientUuids: UUIDS }, [{ dataUrl: 'data:,x' }])
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
}
const refused = (status: number, code: string) => ({ ok: false, status, code, message: 'server words', results: [] })

beforeEach(async () => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetBackgroundRead()
  forgetRead()
  takePendingReceiptApplied()
  publishReceiptSession({ shopId: SHOP_ID, clientUuids: UUIDS })
  await readyRead()
})
afterEach(() => {
  resetBackgroundRead()
  publishReceiptSession(undefined)
  vi.useRealTimers()
})

describe('the review and the row', () => {
  it('opens on the read the background run kept', () => {
    const { result } = renderHook(() => useReceiptReview({ onApplied: vi.fn() }))
    expect(result.current.stored?.readId).toBe(READ_ID)
    expect(getBackgroundRead()).toMatchObject({ status: 'ready' })
  })

  it('a successful apply ends the read: the row is the plain row again', async () => {
    api.apply.mockResolvedValue({ ok: true, applied: 5, results: [scanResult('u1')], undone: [] })
    const { result } = renderHook(() => useReceiptReview({ onApplied: vi.fn() }))
    await act(async () => { await result.current.apply() })
    expect(getBackgroundRead()).toBeUndefined()
    expect(recallRead()).toBeUndefined()
  })

  it('Read it again forgets the read and the row with it', () => {
    const { result } = renderHook(() => useReceiptReview({ onApplied: vi.fn() }))
    act(() => result.current.readAgain())
    expect(getBackgroundRead()).toBeUndefined()
    expect(recallRead()).toBeUndefined()
  })

  it('410 receipt_read_gone (kept 10 minutes, now stale): the read and the row are forgotten, the review says so', async () => {
    api.apply.mockResolvedValue(refused(410, 'receipt_read_gone'))
    const { result } = renderHook(() => useReceiptReview({ onApplied: vi.fn() }))
    await act(async () => { await result.current.apply() })
    expect(result.current.error).toMatchObject({ code: 'receipt_read_gone' })
    expect(getBackgroundRead()).toBeUndefined()
    expect(recallRead()).toBeUndefined()
  })

  it('any other refusal (the Scanned list changed, 409) keeps the read and the ready row', async () => {
    api.apply.mockResolvedValue(refused(409, 'receipt_session_changed'))
    const { result } = renderHook(() => useReceiptReview({ onApplied: vi.fn() }))
    await act(async () => { await result.current.apply() })
    expect(getBackgroundRead()).toMatchObject({ status: 'ready', readId: READ_ID })
    expect(recallRead()).toBeDefined()
  })
})

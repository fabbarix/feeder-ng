// RR4: the finished read waits in memory for the review (10 minutes, design 3.3). The photos are never kept (ADR 0018, Q4).
// Pinned API of ./readStore:
//   READ_KEPT_MS = 600_000
//   rememberRead(read: Omit<StoredRead, 'storedAt'>, now?: number): void     one read at a time: a new one replaces the old
//   recallRead(now?: number): StoredRead | undefined                         undefined after READ_KEPT_MS, or when nothing is kept
//   forgetRead(): void
// Pinned API of ./receiptSession (the Scanned list the Scan screen publishes, read again at apply time):
//   publishReceiptSession(session: ReceiptSession | undefined): void
//   getReceiptSession(): ReceiptSession | undefined
//   subscribeReceiptSession(listener: () => void): () => void
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetRead, READ_KEPT_MS, recallRead, rememberRead } from './readStore'
import { getReceiptSession, publishReceiptSession, subscribeReceiptSession } from './receiptSession'
import { readDone, READ_ID, SHOP_ID, UUIDS } from '../fixtures.test-helper'

afterEach(() => {
  forgetRead()
  publishReceiptSession(undefined)
})

const stored = { readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: readDone() }

describe('readStore', () => {
  it('keeps the read for 10 minutes', () => {
    expect(READ_KEPT_MS).toBe(600_000)
    rememberRead(stored, 1_000)
    expect(recallRead(1_000 + READ_KEPT_MS - 1)).toMatchObject({ readId: READ_ID, storedAt: 1_000 })
  })
  it('lets it go after 10 minutes, and then it is gone for good', () => {
    rememberRead(stored, 1_000)
    expect(recallRead(1_000 + READ_KEPT_MS)).toBeUndefined()
    expect(recallRead(1_001)).toBeUndefined()
  })
  it('is empty at the start and after forgetRead', () => {
    expect(recallRead()).toBeUndefined()
    rememberRead(stored)
    forgetRead()
    expect(recallRead()).toBeUndefined()
  })
  it('a new read replaces the old one', () => {
    rememberRead(stored)
    rememberRead({ ...stored, readId: 'rd-2' })
    expect(recallRead()?.readId).toBe('rd-2')
  })
  it('uses the clock when no time is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime(5_000)
    rememberRead(stored)
    expect(recallRead()?.storedAt).toBe(5_000)
    vi.setSystemTime(5_000 + READ_KEPT_MS + 1)
    expect(recallRead()).toBeUndefined()
    vi.useRealTimers()
  })
})

describe('receiptSession', () => {
  it('holds the last published session', () => {
    expect(getReceiptSession()).toBeUndefined()
    publishReceiptSession({ shopId: 7, clientUuids: ['a', 'b'] })
    expect(getReceiptSession()).toEqual({ shopId: 7, clientUuids: ['a', 'b'] })
    publishReceiptSession({ shopId: 7, clientUuids: ['a', 'b', 'c'] })
    expect(getReceiptSession()?.clientUuids).toEqual(['a', 'b', 'c'])
  })
  it('copies what it is given', () => {
    const uuids = ['a']
    publishReceiptSession({ shopId: 7, clientUuids: uuids })
    uuids.push('z')
    expect(getReceiptSession()?.clientUuids).toEqual(['a'])
  })
  it('tells subscribers on every publish until they unsubscribe', () => {
    const l = vi.fn()
    const off = subscribeReceiptSession(l)
    publishReceiptSession({ shopId: 1, clientUuids: [] })
    publishReceiptSession(undefined)
    expect(l).toHaveBeenCalledTimes(2)
    off()
    publishReceiptSession({ shopId: 2, clientUuids: [] })
    expect(l).toHaveBeenCalledTimes(2)
  })
})

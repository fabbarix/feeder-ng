// b8-rxweb: the background receipt read (docs/design/receipt-reading.md 3.3; docs/dev/design/b8-rxweb.md). The read belongs to the app, not
// to the photos screen: it goes on when the User leaves, and the Scan screen's row and a toast say when it is done.
// Pinned API of ./backgroundRead (plain TypeScript, module-level state, no React):
//   type BackgroundRead =
//     | { status: 'reading'; shopId: number; startedAt: number; readId?: string; connectionLost: boolean }   readId is set once the POST is answered
//     | { status: 'ready'; shopId: number; readId: string; changes: number }                                 changes = the read's proposals; the read itself is in lib/readStore
//     | { status: 'failed'; shopId: number; error: ReceiptErrorInput }
//   startBackgroundRead(session: ReceiptSession, photos: { dataUrl: string }[]): Promise<void>   no-op while one is reading
//   cancelBackgroundRead(): Promise<void>        stops polling, DELETE when a read is on the server, back to no state
//   dismissBackgroundRead(): void                clears a ready or failed state; a ready one also forgets the kept read (lib/readStore)
//   getBackgroundRead(): BackgroundRead | undefined
//   subscribeBackgroundRead(listener: () => void): () => void
//   onBackgroundReadFinished(listener: (s: Exclude<BackgroundRead, { status: 'reading' }>) => void): () => void   ready or failed, once per read
//   resumeBackgroundRead(now?: number): Promise<void>   after a reload: picks up the read the sessionStorage entry names (readId, shopId, clientUuids, startedAt, finishedAt?)
//   resetBackgroundRead(): void                   stops every timer and clears state and storage (tests, sign-out)
//   BACKGROUND_READ_KEY = 'feeder.receipt.read'
// Nothing here ever stores a photo; the entry in sessionStorage holds ids and times only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))

import {
  BACKGROUND_READ_KEY,
  cancelBackgroundRead,
  dismissBackgroundRead,
  getBackgroundRead,
  onBackgroundReadFinished,
  resetBackgroundRead,
  resumeBackgroundRead,
  startBackgroundRead,
  subscribeBackgroundRead,
} from './backgroundRead'
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from './readPolling'
import { forgetRead, READ_KEPT_MS, recallRead } from './readStore'

const session = { shopId: SHOP_ID, clientUuids: UUIDS }
const photos = [{ dataUrl: 'data:image/jpeg;base64,AAAA' }]
const running = { status: 'running' }
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)
const stored = () => sessionStorage.getItem(BACKGROUND_READ_KEY)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
  vi.clearAllMocks()
  resetBackgroundRead()
  forgetRead()
  api.startRead.mockResolvedValue({ id: 'rd-1' })
  api.getRead.mockResolvedValue(running)
  api.cancelRead.mockResolvedValue(undefined)
})
afterEach(() => {
  resetBackgroundRead()
  vi.useRealTimers()
})

describe('a read that runs on its own', () => {
  it('has no state until a read starts', () => {
    expect(getBackgroundRead()).toBeUndefined()
  })

  it('is "reading" while the POST is on its way (no readId yet), then with the readId', async () => {
    let release!: (v: { id: string }) => void
    api.startRead.mockReturnValue(new Promise((r) => { release = r }))
    const p = startBackgroundRead(session, photos)
    expect(getBackgroundRead()).toMatchObject({ status: 'reading', shopId: SHOP_ID, connectionLost: false })
    expect(getBackgroundRead()).not.toHaveProperty('readId')
    release({ id: 'rd-1' })
    await p
    expect(getBackgroundRead()).toMatchObject({ status: 'reading', readId: 'rd-1', startedAt: Date.now() })
  })

  it('posts the Shop, the uuids and the photos', async () => {
    await startBackgroundRead(session, photos)
    expect(api.startRead).toHaveBeenCalledWith({ shopId: SHOP_ID, clientUuids: UUIDS, photos })
  })

  it('a second start while one reads does nothing', async () => {
    await startBackgroundRead(session, photos)
    await startBackgroundRead(session, photos)
    expect(api.startRead).toHaveBeenCalledTimes(1)
  })

  it('tells subscribers on every change', async () => {
    const seen = vi.fn()
    const off = subscribeBackgroundRead(seen)
    await startBackgroundRead(session, photos)
    expect(seen).toHaveBeenCalled()
    seen.mockClear()
    off()
    api.getRead.mockResolvedValue(readDone())
    await tick(POLL_INTERVAL_MS)
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('leaving does not cancel', () => {
  it('keeps polling with nobody looking and ends "ready" with the number of changes, the read kept for the review', async () => {
    const done = readDone()
    api.getRead.mockResolvedValueOnce(running).mockResolvedValue(done)
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS * 2)
    expect(getBackgroundRead()).toEqual({ status: 'ready', shopId: SHOP_ID, readId: 'rd-1', changes: done.proposals.length })
    expect(recallRead()).toMatchObject({ readId: 'rd-1', shopId: SHOP_ID, clientUuids: UUIDS, read: done })
    expect(api.cancelRead).not.toHaveBeenCalled()
  })

  it('stops polling once it is ready', async () => {
    api.getRead.mockResolvedValue(readDone())
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    const calls = api.getRead.mock.calls.length
    await tick(10_000)
    expect(api.getRead.mock.calls.length).toBe(calls)
  })

  it('a failed job ends "failed" with its code and wait, and keeps nothing for the review', async () => {
    api.getRead.mockResolvedValue({ status: 'failed', error: { code: 'assistant_rate_limited', message: 'm', retryAfterSeconds: 30 } })
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    expect(getBackgroundRead()).toEqual({ status: 'failed', shopId: SHOP_ID, error: { code: 'assistant_rate_limited', retryAfterSeconds: 30 } })
    expect(recallRead()).toBeUndefined()
  })

  it('a refused start is "failed" at once, with the refusal code', async () => {
    api.startRead.mockRejectedValue(new ApiError(409, 'read_in_progress', 'x'))
    await startBackgroundRead(session, photos)
    expect(getBackgroundRead()).toEqual({ status: 'failed', shopId: SHOP_ID, error: { code: 'read_in_progress' } })
    expect(api.getRead).not.toHaveBeenCalled()
  })

  it('a lost connection keeps polling and is told, then clears when it is back', async () => {
    api.getRead.mockRejectedValueOnce(new ApiError(0, 'network', 'down')).mockResolvedValue(running)
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    expect(getBackgroundRead()).toMatchObject({ status: 'reading', connectionLost: true })
    await tick(POLL_INTERVAL_MS * 2)
    expect(getBackgroundRead()).toMatchObject({ status: 'reading', connectionLost: false })
  })

  it('gives up 150 s after the start: failed "timeout", and the slot is freed with a DELETE', async () => {
    await startBackgroundRead(session, photos)
    await tick(POLL_TIMEOUT_MS + POLL_INTERVAL_MS)
    expect(getBackgroundRead()).toEqual({ status: 'failed', shopId: SHOP_ID, error: { code: 'timeout' } })
    expect(api.cancelRead).toHaveBeenCalledWith('rd-1')
  })
})

describe('finishing is announced once', () => {
  it('ready: listeners get the state, once', async () => {
    const heard = vi.fn()
    onBackgroundReadFinished(heard)
    api.getRead.mockResolvedValue(readDone())
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS * 3)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard.mock.calls[0]?.[0]).toMatchObject({ status: 'ready', readId: 'rd-1' })
  })

  it('failed: listeners get the failure', async () => {
    const heard = vi.fn()
    onBackgroundReadFinished(heard)
    api.getRead.mockResolvedValue({ status: 'failed', error: { code: 'no_receipt_found', message: 'm' } })
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    expect(heard).toHaveBeenCalledWith({ status: 'failed', shopId: SHOP_ID, error: { code: 'no_receipt_found' } })
  })

  it('a cancel announces nothing', async () => {
    const heard = vi.fn()
    onBackgroundReadFinished(heard)
    await startBackgroundRead(session, photos)
    await cancelBackgroundRead()
    await tick(POLL_TIMEOUT_MS)
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('cancel', () => {
  it('stops polling, frees the slot with a DELETE and clears the state', async () => {
    await startBackgroundRead(session, photos)
    await cancelBackgroundRead()
    expect(api.cancelRead).toHaveBeenCalledWith('rd-1')
    expect(getBackgroundRead()).toBeUndefined()
    await tick(10_000)
    expect(api.getRead).not.toHaveBeenCalled()
  })

  it('while the POST is on its way: the slot the server takes is freed when it answers', async () => {
    let release!: (v: { id: string }) => void
    api.startRead.mockReturnValue(new Promise((r) => { release = r }))
    const p = startBackgroundRead(session, photos)
    await cancelBackgroundRead()
    release({ id: 'rd-9' })
    await p
    expect(api.cancelRead).toHaveBeenCalledWith('rd-9')
    expect(getBackgroundRead()).toBeUndefined()
  })

  it('an answer that arrives after Cancel is ignored', async () => {
    let release!: (v: unknown) => void
    api.getRead.mockReturnValue(new Promise((r) => { release = r }))
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    await cancelBackgroundRead()
    release(readDone())
    await tick(0)
    expect(getBackgroundRead()).toBeUndefined()
    expect(recallRead()).toBeUndefined()
  })
})

describe('dismiss', () => {
  it('clears a failure', async () => {
    api.startRead.mockRejectedValue(new ApiError(0, 'network', 'down'))
    await startBackgroundRead(session, photos)
    dismissBackgroundRead()
    expect(getBackgroundRead()).toBeUndefined()
  })

  it('clears a ready read and forgets the kept read with it, with no DELETE', async () => {
    api.getRead.mockResolvedValue(readDone())
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    dismissBackgroundRead()
    expect(getBackgroundRead()).toBeUndefined()
    expect(recallRead()).toBeUndefined()
    expect(api.cancelRead).not.toHaveBeenCalled()
  })

  it('does not stop a read that is still going', async () => {
    await startBackgroundRead(session, photos)
    dismissBackgroundRead()
    expect(getBackgroundRead()).toMatchObject({ status: 'reading' })
  })
})

describe('a stale read', () => {
  it('a ready read goes away after the 10 minutes the server keeps it (the row is the plain "Read the receipt" again)', async () => {
    api.getRead.mockResolvedValue(readDone())
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    expect(getBackgroundRead()).toMatchObject({ status: 'ready' })
    await tick(READ_KEPT_MS + 1000)
    expect(getBackgroundRead()).toBeUndefined()
    expect(recallRead()).toBeUndefined()
  })

  it('a 404 while polling is "receipt_read_gone" (the server restarted)', async () => {
    api.getRead.mockRejectedValue(new ApiError(404, 'not_found', 'Not found'))
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    expect(getBackgroundRead()).toEqual({ status: 'failed', shopId: SHOP_ID, error: { code: 'receipt_read_gone' } })
  })
})

describe('surviving a reload (sessionStorage: ids and times only)', () => {
  it('writes the read once the server has taken it, never a photo', async () => {
    await startBackgroundRead(session, photos)
    const entry = JSON.parse(stored() ?? 'null') as Record<string, unknown>
    expect(entry).toMatchObject({ shopId: SHOP_ID, readId: 'rd-1', clientUuids: UUIDS, startedAt: Date.now() })
    expect(stored()).not.toContain('base64')
  })

  it('forgets the entry on cancel, on dismiss and when the read is stale', async () => {
    await startBackgroundRead(session, photos)
    await cancelBackgroundRead()
    expect(stored()).toBeNull()
    api.getRead.mockResolvedValue(readDone())
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    expect(stored()).not.toBeNull()
    dismissBackgroundRead()
    expect(stored()).toBeNull()
  })

  it('after a reload a running read is picked up and polled to the end', async () => {
    await startBackgroundRead(session, photos)
    const entry = stored()
    resetBackgroundRead()
    sessionStorage.setItem(BACKGROUND_READ_KEY, entry ?? '')
    api.getRead.mockResolvedValue(readDone())
    await resumeBackgroundRead()
    expect(getBackgroundRead()).toMatchObject({ status: 'reading', readId: 'rd-1', shopId: SHOP_ID })
    await tick(POLL_INTERVAL_MS)
    expect(getBackgroundRead()).toMatchObject({ status: 'ready', readId: 'rd-1' })
    expect(recallRead()).toMatchObject({ readId: 'rd-1', clientUuids: UUIDS })
  })

  it('after a reload a finished read is fetched again (the server still keeps it) and is ready', async () => {
    api.getRead.mockResolvedValue(readDone())
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    const entry = stored()
    resetBackgroundRead()
    forgetRead()
    sessionStorage.setItem(BACKGROUND_READ_KEY, entry ?? '')
    await resumeBackgroundRead()
    await tick(0)
    expect(getBackgroundRead()).toMatchObject({ status: 'ready', readId: 'rd-1' })
    expect(recallRead()).toMatchObject({ readId: 'rd-1' })
  })

  it('a finished read picked up after a reload keeps its first finish: the 10 minutes run from then, and it is not announced again', async () => {
    api.getRead.mockResolvedValue(readDone())
    await startBackgroundRead(session, photos)
    await tick(POLL_INTERVAL_MS)
    const finishedAt = Date.now()
    const entry = stored()
    resetBackgroundRead()
    sessionStorage.setItem(BACKGROUND_READ_KEY, entry ?? '')
    await tick(4 * 60_000)
    const heard = vi.fn()
    const off = onBackgroundReadFinished(heard)
    await resumeBackgroundRead()
    await tick(0)
    expect(getBackgroundRead()).toMatchObject({ status: 'ready', readId: 'rd-1' })
    expect(heard).not.toHaveBeenCalled()
    expect(JSON.parse(stored() ?? '{}')).toMatchObject({ finishedAt })
    await tick(READ_KEPT_MS - 4 * 60_000 - 1)
    expect(getBackgroundRead()).toMatchObject({ status: 'ready' })
    await tick(1)
    expect(getBackgroundRead()).toBeUndefined()
    expect(recallRead()).toBeUndefined()
    off()
  })

  it('a read the server no longer has (404) is dropped silently on resume: no state, no entry', async () => {
    await startBackgroundRead(session, photos)
    const entry = stored()
    resetBackgroundRead()
    sessionStorage.setItem(BACKGROUND_READ_KEY, entry ?? '')
    api.getRead.mockRejectedValue(new ApiError(404, 'not_found', 'Not found'))
    await resumeBackgroundRead()
    await tick(0)
    expect(getBackgroundRead()).toBeUndefined()
    expect(stored()).toBeNull()
  })

  it('an entry older than the read can live (150 s running, 10 minutes finished) is dropped without asking the server', async () => {
    sessionStorage.setItem(BACKGROUND_READ_KEY, JSON.stringify({ shopId: SHOP_ID, readId: 'rd-old', clientUuids: UUIDS, startedAt: Date.now() - READ_KEPT_MS - POLL_TIMEOUT_MS - 1 }))
    await resumeBackgroundRead()
    expect(api.getRead).not.toHaveBeenCalled()
    expect(getBackgroundRead()).toBeUndefined()
    expect(stored()).toBeNull()
  })

  it('an unreadable entry is ignored', async () => {
    sessionStorage.setItem(BACKGROUND_READ_KEY, '{not json')
    await expect(resumeBackgroundRead()).resolves.toBeUndefined()
    expect(getBackgroundRead()).toBeUndefined()
  })

  it('works with storage that throws', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await expect(startBackgroundRead(session, photos)).resolves.toBeUndefined()
    await expect(resumeBackgroundRead()).resolves.toBeUndefined()
    expect(getBackgroundRead()).toMatchObject({ status: 'reading' })
    get.mockRestore()
    set.mockRestore()
  })
})

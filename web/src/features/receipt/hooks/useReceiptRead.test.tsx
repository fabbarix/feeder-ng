// RR4: start, poll, cancel one receipt read, with a mocked api and fake timers (design 3.3, 7.1, 9).
// Pinned API of ./useReceiptRead:
//   useReceiptRead(session: { shopId: number; clientUuids: string[] }): UseReceiptRead
//   UseReceiptRead = {
//     phase: 'idle' | 'starting' | 'running' | 'done' | 'failed'
//     busy: boolean                         starting or running
//     error?: ReceiptErrorInput             set in 'failed'
//     elapsedSeconds: number                since the read started (the screen says "Long receipts can take up to a minute" after 15)
//     connectionLost: boolean               the last poll could not reach the server; polling goes on
//     readId?: string
//     start(photos: { dataUrl: string }[]): Promise<void>
//     cancel(): Promise<void>               DELETE, back to 'idle'
//     reset(): void                         clears a failure ('idle')
//   }
//   On done the finished read is kept with rememberRead (lib/readStore) with the session it was made from.
// Pinned constants of ../lib/readPolling: POLL_INTERVAL_MS = 1500, POLL_TIMEOUT_MS = 150_000 (the server cuts a read at 120 s), LONG_READ_AFTER_S = 15.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { forgetRead, recallRead } from '../lib/readStore'
import { LONG_READ_AFTER_S, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../lib/readPolling'
import { readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))

import { useReceiptRead } from './useReceiptRead'

const session = { shopId: SHOP_ID, clientUuids: UUIDS }
const photos = [{ dataUrl: 'data:image/jpeg;base64,AAAA' }, { dataUrl: 'data:image/jpeg;base64,BBBB' }]
const running = { status: 'running' }

const setup = () => renderHook(() => useReceiptRead(session))
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
async function begin(h: ReturnType<typeof setup>) {
  await act(async () => { await h.result.current.start(photos) })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  forgetRead()
  api.startRead.mockResolvedValue({ id: 'rd-1' })
  api.getRead.mockResolvedValue(running)
  api.cancelRead.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('constants', () => {
  it('poll every 1.5 s, give up after 150 s, say "long" after 15 s', () => {
    expect(POLL_INTERVAL_MS).toBe(1500)
    expect(POLL_TIMEOUT_MS).toBe(150_000)
    expect(LONG_READ_AFTER_S).toBe(15)
  })
})

describe('start', () => {
  it('is idle at first', () => {
    expect(setup().result.current).toMatchObject({ phase: 'idle', busy: false, error: undefined, elapsedSeconds: 0, connectionLost: false })
  })
  it('posts {shopId, clientUuids, photos} and runs', async () => {
    const h = setup()
    await begin(h)
    expect(api.startRead).toHaveBeenCalledWith({ shopId: SHOP_ID, clientUuids: UUIDS, photos })
    expect(h.result.current).toMatchObject({ phase: 'running', busy: true, readId: 'rd-1' })
  })
  it('is "starting" while the POST is on its way', async () => {
    let release!: (v: { id: string }) => void
    api.startRead.mockReturnValue(new Promise((r) => { release = r }))
    const h = setup()
    let p!: Promise<void>
    act(() => { p = h.result.current.start(photos) })
    expect(h.result.current).toMatchObject({ phase: 'starting', busy: true })
    await act(async () => { release({ id: 'rd-1' }); await p })
    expect(h.result.current.phase).toBe('running')
  })
  it('a second start while busy does nothing', async () => {
    const h = setup()
    await begin(h)
    await begin(h)
    expect(api.startRead).toHaveBeenCalledTimes(1)
  })
})

describe('polling', () => {
  it('asks again every 1.5 s', async () => {
    const h = setup()
    await begin(h)
    expect(api.getRead).not.toHaveBeenCalled()
    await tick(POLL_INTERVAL_MS)
    expect(api.getRead).toHaveBeenCalledTimes(1)
    expect(api.getRead.mock.calls[0]?.[0]).toBe('rd-1')
    await tick(POLL_INTERVAL_MS)
    expect(api.getRead).toHaveBeenCalledTimes(2)
    await tick(POLL_INTERVAL_MS * 2)
    expect(api.getRead).toHaveBeenCalledTimes(4)
    expect(h.result.current.phase).toBe('running')
  })
  it('counts the seconds since the start', async () => {
    const h = setup()
    await begin(h)
    await tick(16_000)
    expect(h.result.current.elapsedSeconds).toBeGreaterThanOrEqual(LONG_READ_AFTER_S)
  })
  it('done: keeps the read for the review (with the session it was made from), stops polling', async () => {
    const done = readDone()
    api.getRead.mockResolvedValueOnce(running).mockResolvedValue(done)
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS * 2)
    expect(h.result.current).toMatchObject({ phase: 'done', busy: false })
    expect(recallRead()).toMatchObject({ readId: 'rd-1', shopId: SHOP_ID, clientUuids: UUIDS, read: done })
    const calls = api.getRead.mock.calls.length
    await tick(10_000)
    expect(api.getRead.mock.calls.length).toBe(calls)
  })
  it('failed: the code and the wait come from the job', async () => {
    api.getRead.mockResolvedValue({ status: 'failed', error: { code: 'assistant_rate_limited', message: 'm', retryAfterSeconds: 30 } })
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS)
    expect(h.result.current).toMatchObject({ phase: 'failed', busy: false, error: { code: 'assistant_rate_limited', retryAfterSeconds: 30 } })
    expect(recallRead()).toBeUndefined()
  })
  it('a failed job without a wait has no retryAfterSeconds', async () => {
    api.getRead.mockResolvedValue({ status: 'failed', error: { code: 'no_receipt_found', message: 'm' } })
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS)
    expect(h.result.current.error).toEqual({ code: 'no_receipt_found' })
  })
  it('a lost connection keeps polling and says so, then clears when it is back', async () => {
    api.getRead.mockRejectedValueOnce(new ApiError(0, 'network', 'down')).mockResolvedValue(running)
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS)
    expect(h.result.current).toMatchObject({ phase: 'running', connectionLost: true })
    await tick(POLL_INTERVAL_MS * 3)
    expect(h.result.current.connectionLost).toBe(false)
    expect(api.getRead.mock.calls.length).toBeGreaterThan(1)
  })
  it('keeps trying through many lost polls (the read continues on the server)', async () => {
    api.getRead.mockRejectedValue(new ApiError(0, 'network', 'down'))
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS * 20)
    expect(h.result.current).toMatchObject({ phase: 'running', connectionLost: true })
  })
  it('a 404 means the read is gone (the server restarted)', async () => {
    api.getRead.mockRejectedValue(new ApiError(404, 'not_found', 'Not found'))
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS)
    expect(h.result.current).toMatchObject({ phase: 'failed', error: { code: 'receipt_read_gone' } })
  })
  it('gives up after the overall timeout: fails with "timeout" and frees the running slot with a DELETE', async () => {
    const h = setup()
    await begin(h)
    await tick(POLL_TIMEOUT_MS + POLL_INTERVAL_MS)
    expect(h.result.current).toMatchObject({ phase: 'failed', busy: false, error: { code: 'timeout' } })
    expect(api.cancelRead).toHaveBeenCalledWith('rd-1')
    const calls = api.getRead.mock.calls.length
    await tick(10_000)
    expect(api.getRead.mock.calls.length).toBe(calls)
  })
  it('does not give up before the timeout', async () => {
    const h = setup()
    await begin(h)
    await tick(POLL_TIMEOUT_MS - 2000)
    expect(h.result.current.phase).toBe('running')
    expect(api.cancelRead).not.toHaveBeenCalled()
  })
})

describe('refusals of the start (design 9)', () => {
  const refuse = async (err: unknown) => {
    api.startRead.mockRejectedValue(err)
    const h = setup()
    await begin(h)
    return h
  }
  it('409 assistant_unavailable keeps the reason', async () => {
    const h = await refuse(new ApiError(409, 'assistant_unavailable', 'x', { reason: 'no_key' }))
    expect(h.result.current).toMatchObject({ phase: 'failed', busy: false, error: { code: 'assistant_unavailable', reason: 'no_key' } })
    expect(api.getRead).not.toHaveBeenCalled()
  })
  it('409 read_in_progress', async () => {
    expect((await refuse(new ApiError(409, 'read_in_progress', 'x'))).result.current.error).toEqual({ code: 'read_in_progress' })
  })
  it('429 too_many_reads keeps retryAfterSeconds', async () => {
    expect((await refuse(new ApiError(429, 'too_many_reads', 'x', { retryAfterSeconds: 720 }))).result.current.error).toEqual({ code: 'too_many_reads', retryAfterSeconds: 720 })
  })
  it.each(['photos_empty', 'too_many_photos', 'photo_too_large', 'photo_unsupported', 'scans_empty'])('422 %s', async (code) => {
    expect((await refuse(new ApiError(422, code, 'x'))).result.current.error).toEqual({ code })
  })
  it('a lost connection is "network"', async () => {
    expect((await refuse(new ApiError(0, 'network', 'down'))).result.current.error).toEqual({ code: 'network' })
  })
  it('anything else keeps its code', async () => {
    expect((await refuse(new ApiError(500, 'internal', 'x'))).result.current.error).toEqual({ code: 'internal' })
  })
  it('after a refusal the User can start again', async () => {
    api.startRead.mockRejectedValueOnce(new ApiError(0, 'network', 'down')).mockResolvedValue({ id: 'rd-2' })
    const h = setup()
    await begin(h)
    expect(h.result.current.phase).toBe('failed')
    await begin(h)
    expect(h.result.current).toMatchObject({ phase: 'running', readId: 'rd-2', error: undefined })
  })
})

describe('cancel and leaving', () => {
  it('Cancel sends DELETE, goes idle and polls no more', async () => {
    const h = setup()
    await begin(h)
    await act(async () => { await h.result.current.cancel() })
    expect(api.cancelRead).toHaveBeenCalledWith('rd-1')
    expect(h.result.current).toMatchObject({ phase: 'idle', busy: false, error: undefined })
    await tick(10_000)
    expect(api.getRead).not.toHaveBeenCalled()
  })
  it('a failed DELETE still goes idle', async () => {
    api.cancelRead.mockRejectedValue(new ApiError(0, 'network', 'down'))
    const h = setup()
    await begin(h)
    await act(async () => { await h.result.current.cancel() })
    expect(h.result.current.phase).toBe('idle')
  })
  it('cancelled while the POST is on its way: the slot the server takes is freed', async () => {
    let release!: (v: { id: string }) => void
    api.startRead.mockReturnValue(new Promise((r) => { release = r }))
    const h = setup()
    let p!: Promise<void>
    act(() => { p = h.result.current.start(photos) })
    await act(async () => { await h.result.current.cancel() })
    await act(async () => { release({ id: 'rd-9' }); await p })
    expect(api.cancelRead).toHaveBeenCalledWith('rd-9')
    expect(h.result.current.phase).toBe('idle')
  })
  it('an answer that arrives after Cancel is ignored', async () => {
    let release!: (v: unknown) => void
    api.getRead.mockReturnValue(new Promise((r) => { release = r }))
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS)
    await act(async () => { await h.result.current.cancel() })
    await act(async () => { release(readDone()) })
    expect(h.result.current.phase).toBe('idle')
    expect(recallRead()).toBeUndefined()
  })
  it('leaving the screen while running stops polling and frees the slot (a best-effort DELETE that outlives the page)', async () => {
    const h = setup()
    await begin(h)
    h.unmount()
    expect(api.cancelRead).toHaveBeenCalledWith('rd-1', { keepalive: true })
    await tick(10_000)
    expect(api.getRead).not.toHaveBeenCalled()
  })
  it('leaving after the read is done sends no DELETE', async () => {
    api.getRead.mockResolvedValue(readDone())
    const h = setup()
    await begin(h)
    await tick(POLL_INTERVAL_MS)
    h.unmount()
    expect(api.cancelRead).not.toHaveBeenCalled()
  })
  it('leaving while idle sends no DELETE', () => {
    setup().unmount()
    expect(api.cancelRead).not.toHaveBeenCalled()
  })
  it('reset clears a failure', async () => {
    api.startRead.mockRejectedValue(new ApiError(0, 'network', 'down'))
    const h = setup()
    await begin(h)
    act(() => h.result.current.reset())
    expect(h.result.current).toMatchObject({ phase: 'idle', error: undefined })
  })
})

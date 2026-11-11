// WP-E/G: start, poll, cancel one Recipe Assistant read with a mocked API and fake timers (ra-e-import.md section 5.1).
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { plan } from '../fixtures.test-helper'
import { pollDelay } from '../lib/readProgress'
import type { ReadInput, ReadView } from '../types'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useRecipeRead } from './useRecipeRead'

const text: ReadInput = { kind: 'text', text: '  Soup: 1 onion  ' }
const doneView: ReadView = {
  id: 'rd1',
  state: 'done',
  review: { id: 'imp1', plan: plan(), photos: [{ index: 0, width: 1600, height: 1200 }] },
  source: { kind: 'photo', photoCount: 1 },
  model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
}
const running = (state: ReadView['state']): ReadView => ({ id: 'rd1', state })

function setup() {
  const onDone = vi.fn()
  const hook = renderHook(() => useRecipeRead({ onDone }))
  return { ...hook, onDone }
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
async function begin(h: ReturnType<typeof setup>, input: ReadInput = text) {
  await act(async () => { await h.result.current.start(input) })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  api.startRead.mockResolvedValue({ id: 'rd1', state: 'reading' })
  api.getRead.mockResolvedValue(running('reading'))
  api.cancelRead.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('useRecipeRead: start', () => {
  it('starts idle', () => {
    const { result } = setup()
    expect(result.current).toMatchObject({ phase: 'idle', busy: false, state: undefined, error: undefined, elapsedSeconds: 0 })
  })
  it('posts the checked body (trimmed text) and becomes running in the state the server answered', async () => {
    const h = setup()
    await begin(h)
    expect(api.startRead).toHaveBeenCalledWith({ text: 'Soup: 1 onion' })
    expect(h.result.current).toMatchObject({ phase: 'running', busy: true, kind: 'text', state: 'reading' })
  })
  it('a page read shows its first state (fetching) from the answer', async () => {
    api.startRead.mockResolvedValue({ id: 'rd1', state: 'fetching' })
    const h = setup()
    await begin(h, { kind: 'url', url: 'https://example.com/soup' })
    expect(api.startRead).toHaveBeenCalledWith({ url: 'https://example.com/soup' })
    expect(h.result.current).toMatchObject({ kind: 'url', state: 'fetching' })
  })
  it('refuses a bad input locally: no request, failed with the code', async () => {
    const h = setup()
    await begin(h, { kind: 'text', text: '   ' })
    expect(api.startRead).not.toHaveBeenCalled()
    expect(h.result.current).toMatchObject({ phase: 'failed', busy: false, error: { code: 'text_empty' } })
  })
  it('a refused start (409 read_in_progress, 429 too_many_reads with the time, 503 assistant_off) is failed with the server code and details', async () => {
    const h = setup()
    api.startRead.mockRejectedValueOnce(new ApiError(429, 'too_many_reads', 'x', { retryAfterSeconds: 90 }))
    await begin(h)
    expect(h.result.current).toMatchObject({ phase: 'failed', error: { code: 'too_many_reads', retryAfterSeconds: 90 } })
    api.startRead.mockRejectedValueOnce(new ApiError(409, 'read_in_progress', 'x'))
    await begin(h)
    expect(h.result.current.error).toEqual({ code: 'read_in_progress' })
    api.startRead.mockRejectedValueOnce(new ApiError(0, 'network', 'down'))
    await begin(h)
    expect(h.result.current.error).toEqual({ code: 'network' })
  })
  it('is busy while the POST is in flight (phase starting) and ignores a second start', async () => {
    let release: (v: unknown) => void = () => undefined
    api.startRead.mockReturnValue(new Promise((r) => { release = r }))
    const h = setup()
    let first: Promise<void> = Promise.resolve()
    act(() => { first = h.result.current.start(text) })
    expect(h.result.current).toMatchObject({ phase: 'starting', busy: true })
    await act(async () => { await h.result.current.start(text) })
    expect(api.startRead).toHaveBeenCalledTimes(1)
    await act(async () => { release({ id: 'rd1', state: 'reading' }); await first })
    expect(h.result.current.phase).toBe('running')
  })
  it('a second start while running does nothing', async () => {
    const h = setup()
    await begin(h)
    await begin(h)
    expect(api.startRead).toHaveBeenCalledTimes(1)
  })
  it('after a failure a new start works and clears the error', async () => {
    const h = setup()
    await begin(h, { kind: 'text', text: '' })
    expect(h.result.current.phase).toBe('failed')
    await begin(h)
    expect(h.result.current).toMatchObject({ phase: 'running', error: undefined })
  })
})

describe('useRecipeRead: poll', () => {
  it('polls the read by id with an abort signal, first after pollDelay(0), then at the policy\'s pace', async () => {
    const h = setup()
    await begin(h)
    expect(api.getRead).not.toHaveBeenCalled()
    await tick(pollDelay(0) - 1)
    expect(api.getRead).not.toHaveBeenCalled()
    await tick(1)
    expect(api.getRead).toHaveBeenCalledTimes(1)
    expect(api.getRead.mock.calls[0]![0]).toBe('rd1')
    expect(api.getRead.mock.calls[0]![1]).toMatchObject({ signal: expect.any(AbortSignal) })
    await tick(pollDelay(1))
    expect(api.getRead).toHaveBeenCalledTimes(2)
  })
  it('follows the state it reads', async () => {
    api.getRead.mockResolvedValueOnce(running('checking')).mockResolvedValue(running('images'))
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    expect(h.result.current.state).toBe('checking')
    await tick(pollDelay(1))
    expect(h.result.current.state).toBe('images')
  })
  it('on done: hands the review to onDone once (id, plan, photos, source, model), goes idle and stops polling', async () => {
    api.getRead.mockResolvedValueOnce(running('checking')).mockResolvedValue(doneView)
    const h = setup()
    await begin(h, { kind: 'photo', photos: [{ kind: 'url', url: 'https://example.com/a.jpg' }] })
    await tick(pollDelay(0))
    await tick(pollDelay(1))
    expect(h.onDone).toHaveBeenCalledTimes(1)
    expect(h.onDone).toHaveBeenCalledWith({ id: 'imp1', plan: plan(), photos: [{ index: 0, width: 1600, height: 1200 }], source: { kind: 'photo', photoCount: 1 }, model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' } })
    expect(h.result.current).toMatchObject({ phase: 'idle', busy: false, error: undefined })
    const calls = api.getRead.mock.calls.length
    await tick(20_000)
    expect(api.getRead.mock.calls.length).toBe(calls)
    expect(h.onDone).toHaveBeenCalledTimes(1)
  })
  it('a "done" without a review is a failure, not a crash', async () => {
    api.getRead.mockResolvedValue({ id: 'rd1', state: 'done' })
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    expect(h.onDone).not.toHaveBeenCalled()
    expect(h.result.current).toMatchObject({ phase: 'failed', error: { code: 'unknown' } })
  })
  it('on failed: phase failed with the read\'s error (code, retryAfterSeconds, errors, model) and no more polls', async () => {
    const error = { code: 'assistant_declined', message: 'm', model: 'Claude Haiku 5.5' }
    api.getRead.mockResolvedValue({ id: 'rd1', state: 'failed', error })
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    expect(h.result.current).toMatchObject({ phase: 'failed', busy: false, error: { code: 'assistant_declined', model: 'Claude Haiku 5.5' } })
    const calls = api.getRead.mock.calls.length
    await tick(10_000)
    expect(api.getRead.mock.calls.length).toBe(calls)
  })
  it('a read cancelled elsewhere (state cancelled) ends idle without an error', async () => {
    api.getRead.mockResolvedValue(running('cancelled'))
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    expect(h.result.current).toMatchObject({ phase: 'idle', error: undefined })
    expect(h.onDone).not.toHaveBeenCalled()
  })
  it('a 404 means the read is lost: failed "expired" at once, no retries', async () => {
    api.getRead.mockRejectedValue(new ApiError(404, 'not_found', 'x'))
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    expect(h.result.current).toMatchObject({ phase: 'failed', error: { code: 'expired' } })
    expect(api.getRead).toHaveBeenCalledTimes(1)
  })
  it('one failed poll is retried after the back-off and the read carries on', async () => {
    api.getRead.mockRejectedValueOnce(new ApiError(0, 'network', 'down')).mockResolvedValue(doneView)
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    expect(h.result.current.phase).toBe('running')
    await tick(999)
    expect(api.getRead).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(api.getRead).toHaveBeenCalledTimes(2)
    expect(h.onDone).toHaveBeenCalledTimes(1)
  })
  it('gives up after 5 failed polls in a row: failed with the last error, and frees the server slot with one DELETE', async () => {
    api.getRead.mockRejectedValue(new ApiError(0, 'network', 'down'))
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    for (const wait of [1000, 2000, 4000, 8000]) await tick(wait)
    expect(api.getRead).toHaveBeenCalledTimes(5)
    expect(h.result.current).toMatchObject({ phase: 'failed', error: { code: 'network' } })
    expect(api.cancelRead).toHaveBeenCalledTimes(1)
    expect(api.cancelRead).toHaveBeenCalledWith('rd1')
    await tick(60_000)
    expect(api.getRead).toHaveBeenCalledTimes(5)
  })
  it('a success resets the failure count (2 failures, a success, 4 failures: still running)', async () => {
    const fail = () => new ApiError(0, 'network', 'x')
    api.getRead
      .mockRejectedValueOnce(fail()).mockRejectedValueOnce(fail())
      .mockResolvedValueOnce(running('reading'))
      .mockRejectedValueOnce(fail()).mockRejectedValueOnce(fail()).mockRejectedValueOnce(fail()).mockRejectedValueOnce(fail())
      .mockResolvedValue(running('reading'))
    const h = setup()
    await begin(h)
    for (let i = 0; i < 40; i++) await tick(1000)
    expect(api.getRead.mock.calls.length).toBeGreaterThan(8)
    expect(h.result.current.phase).toBe('running')
    expect(api.cancelRead).not.toHaveBeenCalled()
  })
  it('gives up at the deadline (200 s) when the read never ends: failed assistant_unreachable, with one DELETE', async () => {
    const h = setup()
    await begin(h)
    await tick(200_000 + 2_000)
    expect(h.result.current).toMatchObject({ phase: 'failed', error: { code: 'assistant_unreachable' } })
    expect(api.cancelRead).toHaveBeenCalledWith('rd1')
  })
  it('counts seconds while it runs', async () => {
    const h = setup()
    await begin(h)
    await tick(25_000)
    expect(h.result.current.elapsedSeconds).toBeGreaterThanOrEqual(24)
    expect(h.result.current.elapsedSeconds).toBeLessThanOrEqual(26)
  })
  it('stops polling and never calls onDone after unmount', async () => {
    api.getRead.mockResolvedValue(doneView)
    const h = setup()
    await begin(h)
    h.unmount()
    await tick(10_000)
    expect(api.getRead).not.toHaveBeenCalled()
    expect(h.onDone).not.toHaveBeenCalled()
  })
})

describe('useRecipeRead: cancel', () => {
  it('sends DELETE once, aborts the poll in flight, goes idle with no error and stops polling', async () => {
    let signal: AbortSignal | undefined
    api.getRead.mockImplementation((_id: string, o?: { signal?: AbortSignal }) => { signal = o?.signal; return new Promise(() => undefined) })
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    await act(async () => { await h.result.current.cancel() })
    expect(api.cancelRead).toHaveBeenCalledTimes(1)
    expect(api.cancelRead).toHaveBeenCalledWith('rd1')
    expect(signal?.aborted).toBe(true)
    expect(h.result.current).toMatchObject({ phase: 'idle', busy: false, error: undefined, state: undefined })
    await tick(20_000)
    expect(api.getRead).toHaveBeenCalledTimes(1)
  })
  it('a poll that answers "done" after Cancel is ignored', async () => {
    let answer: (v: ReadView) => void = () => undefined
    api.getRead.mockImplementation(() => new Promise((r) => { answer = r }))
    const h = setup()
    await begin(h)
    await tick(pollDelay(0))
    await act(async () => { await h.result.current.cancel() })
    await act(async () => { answer(doneView) })
    expect(h.onDone).not.toHaveBeenCalled()
    expect(h.result.current.phase).toBe('idle')
  })
  it('goes idle even when the DELETE fails (already finished, 404, offline)', async () => {
    api.cancelRead.mockRejectedValue(new ApiError(404, 'not_found', 'x'))
    const h = setup()
    await begin(h)
    await act(async () => { await h.result.current.cancel() })
    expect(h.result.current).toMatchObject({ phase: 'idle', error: undefined })
  })
  it('does nothing when idle (no DELETE)', async () => {
    const h = setup()
    await act(async () => { await h.result.current.cancel() })
    expect(api.cancelRead).not.toHaveBeenCalled()
  })
  it('lets the User start again right after', async () => {
    const h = setup()
    await begin(h)
    await act(async () => { await h.result.current.cancel() })
    await begin(h)
    expect(api.startRead).toHaveBeenCalledTimes(2)
    expect(h.result.current.phase).toBe('running')
  })
})

describe('useRecipeRead: reset', () => {
  it('clears a failure', async () => {
    const h = setup()
    await begin(h, { kind: 'text', text: '' })
    act(() => h.result.current.reset())
    expect(h.result.current).toMatchObject({ phase: 'idle', error: undefined })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpClient } from '../../lib/http'
import { createScanApi } from './api'
import { createMemoryOpStore, OfflineQueue } from './lib/queue'
import type { Op } from './types'

const op = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T11:59:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 })

/** A fetch that never answers, and rejects with the signal's reason when the signal fires (as the real one does). */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    })
  })
}

const timeout = () => new DOMException('signal timed out', 'TimeoutError')

describe('createScanApi.sync timeout', () => {
  it('asks for a 20 s timeout signal by default and gives it to the request', async () => {
    const timeoutSignal = vi.fn((_ms: number) => new AbortController().signal)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    await createScanApi(createHttpClient({ fetch }), { timeoutSignal }).sync([op('a')])
    expect(timeoutSignal).toHaveBeenCalledWith(20_000)
    expect(fetch.mock.calls[0]![1].signal).toBe(timeoutSignal.mock.results[0]!.value)
  })

  it('the timeout is configurable', async () => {
    const timeoutSignal = vi.fn((_ms: number) => new AbortController().signal)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    await createScanApi(createHttpClient({ fetch }), { timeoutSignal, syncTimeoutMs: 5 }).sync([op('a')])
    expect(timeoutSignal).toHaveBeenCalledWith(5)
  })

  it('a hanging sync is raised as ApiError(0, "timeout")', async () => {
    const controller = new AbortController()
    const api = createScanApi(createHttpClient({ fetch: hangingFetch() }), { timeoutSignal: () => controller.signal })
    const pending = api.sync([op('a')]).catch((e) => e)
    controller.abort(timeout())
    const err = (await pending) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.code).toBe('timeout')
  })

  it('a hanging sync times out as offline, and a pending cancel then resolves (false: the batch may have been applied)', async () => {
    const controller = new AbortController()
    const server = hangingFetch()
    const api = createScanApi(createHttpClient({ fetch: server }), { timeoutSignal: () => controller.signal })
    const queue = new OfflineQueue(createMemoryOpStore())
    await queue.enqueue(op('a'))
    const flushing = queue.flush(api)
    await vi.waitFor(() => expect(server).toHaveBeenCalledTimes(1))
    let settled = false
    const cancelled = queue.cancel('a').then((v) => ((settled = true), v))
    await new Promise((r) => setTimeout(r, 20))
    expect(settled).toBe(false) // blocked behind the hanging send
    controller.abort(timeout())
    expect((await flushing).offline).toBe(true)
    expect(await cancelled).toBe(false)
    expect(await queue.pending()).toEqual([])
  })

  it('after a timeout the entry is kept with attempts 1 for the backoff retry', async () => {
    const controller = new AbortController()
    const api = createScanApi(createHttpClient({ fetch: hangingFetch() }), { timeoutSignal: () => controller.signal })
    const queue = new OfflineQueue(createMemoryOpStore())
    await queue.enqueue(op('a'))
    const flushing = queue.flush(api)
    await new Promise((r) => setTimeout(r, 10))
    controller.abort(timeout())
    expect((await flushing).offline).toBe(true)
    expect((await queue.pending()).map((e) => e.attempts)).toEqual([1])
  })
})

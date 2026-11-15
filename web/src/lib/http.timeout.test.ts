import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET_TIMEOUT_MS } from './dataState'
import { ApiError, createHttpClient } from './http'

// B9-20 (RES-06): a GET that carries nothing ends in ApiError(0, 'timeout') instead of an endless skeleton.
afterEach(() => vi.restoreAllMocks())

const ok = (_url?: string, _init?: RequestInit) => Promise.resolve(new Response('{}', { status: 200 }))
/** A fetch that never answers and rejects the way fetch does when its signal aborts. */
const hanging = () =>
  vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    }),
  )

describe('GET timeout', () => {
  it('a GET carries AbortSignal.timeout(10 000) by default', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetch = vi.fn(ok)
    await createHttpClient({ fetch }).get('/api/recipes')
    expect(timeout).toHaveBeenCalledWith(GET_TIMEOUT_MS)
    expect(fetch.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal)
  })

  it('a write carries no timeout: a save that is slow is not abandoned (it could still land)', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetch = vi.fn(ok)
    const http = createHttpClient({ fetch })
    await http.post('/api/recipes', { a: 1 })
    await http.put('/api/a', {})
    await http.patch('/api/a', {})
    await http.delete('/api/a')
    expect(timeout).not.toHaveBeenCalled()
    for (const call of fetch.mock.calls) expect(call[1]!.signal).toBeUndefined()
  })

  it('a GET that never answers rejects with ApiError(0, "timeout") after `timeoutMs`', async () => {
    const http = createHttpClient({ fetch: hanging() })
    const err = await http.get('/api/recipes', { timeoutMs: 25 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 0, code: 'timeout' })
  })

  it('`timeoutMs: 0` turns the timeout off for a GET that is meant to wait', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetch = vi.fn(ok)
    await createHttpClient({ fetch }).get('/api/stream', { timeoutMs: 0 })
    expect(timeout).not.toHaveBeenCalled()
    expect(fetch.mock.calls[0]![1]!.signal).toBeUndefined()
  })

  it('a caller\'s own signal still aborts a GET, and is not mistaken for a timeout', async () => {
    const ctl = new AbortController()
    const http = createHttpClient({ fetch: hanging() })
    const pending = http.get('/api/recipes', { signal: ctl.signal }).catch((e: unknown) => e)
    ctl.abort()
    const err = await pending
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).not.toBe('timeout')
  })

  it('a caller\'s signal and the timeout both apply to a GET (either one aborts it)', async () => {
    const fetch = vi.fn(ok)
    const ctl = new AbortController()
    await createHttpClient({ fetch }).get('/api/recipes', { signal: ctl.signal })
    const signal = fetch.mock.calls[0]![1]!.signal!
    expect(signal.aborted).toBe(false)
    ctl.abort()
    expect(signal.aborted).toBe(true)
  })

  it('a network failure is still ApiError(0, "network")', async () => {
    const http = createHttpClient({ fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    await expect(http.get('/api/recipes')).rejects.toMatchObject({ status: 0, code: 'network' })
  })
})

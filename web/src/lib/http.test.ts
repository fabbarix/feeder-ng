import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpClient } from './http'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('createHttpClient', () => {
  it('GETs JSON with same-origin credentials and no Content-Type', async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { id: 1 }))
    const http = createHttpClient({ fetch })
    await expect(http.get<{ id: number }>('/api/me')).resolves.toEqual({ id: 1 })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/me')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('same-origin')
    expect(new Headers(init.headers).has('Content-Type')).toBe(false)
  })

  it('sends JSON bodies for post, put and patch', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(200, {})))
    const http = createHttpClient({ fetch })
    await http.post('/api/a', { x: 1 })
    await http.put('/api/b', { y: 2 })
    await http.patch('/api/c', { z: 3 })
    const methods = fetch.mock.calls.map((c) => c[1].method)
    expect(methods).toEqual(['POST', 'PUT', 'PATCH'])
    expect(fetch.mock.calls[0]![1].body).toBe('{"x":1}')
    expect(new Headers(fetch.mock.calls[0]![1].headers).get('Content-Type')).toBe('application/json')
  })

  it('supports delete and a baseUrl', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const http = createHttpClient({ fetch, baseUrl: 'http://x.test' })
    await expect(http.delete('/api/a/1')).resolves.toBeUndefined()
    expect(fetch.mock.calls[0]![0]).toBe('http://x.test/api/a/1')
    expect(fetch.mock.calls[0]![1].method).toBe('DELETE')
  })

  it('throws ApiError with the server error code and message', async () => {
    const fetch = vi.fn().mockResolvedValue(json(403, { error: { code: 'forbidden', message: 'Admins only' } }))
    const http = createHttpClient({ fetch })
    const err = await http.get('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 403, code: 'forbidden', message: 'Admins only' })
  })

  it('falls back to http_error when the body is not the error shape', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    const err = await createHttpClient({ fetch }).get('/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 502, code: 'http_error' })
  })

  it('reports network failures as status 0 / code network', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await createHttpClient({ fetch }).get('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 0, code: 'network' })
  })

  it('calls onUnauthenticated on 401 and still throws', async () => {
    const fetch = vi.fn().mockResolvedValue(json(401, { error: { code: 'unauthenticated', message: 'no' } }))
    const onUnauthenticated = vi.fn()
    const http = createHttpClient({ fetch, onUnauthenticated })
    await expect(http.get('/api/me')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthenticated).toHaveBeenCalledOnce()
  })

  it('keeps the extra keys of the error object as details', async () => {
    const body = { error: { code: 'unknown_unit', message: 'no', field: 'lines[1].unit', unit: 'clove', ingredientId: 7 } }
    const err = (await createHttpClient({ fetch: vi.fn().mockResolvedValue(json(422, body)) }).get('/api/x').catch((e) => e)) as ApiError
    expect(err).toMatchObject({ status: 422, code: 'unknown_unit', message: 'no' })
    expect(err.details).toEqual({ field: 'lines[1].unit', unit: 'clove', ingredientId: 7 })
  })

  describe('request timeout (a signal passed as the third argument of post)', () => {
    const hangingFetch = () =>
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
        })
      })

    it('forwards the signal to fetch', async () => {
      const fetch = vi.fn().mockResolvedValue(json(200, {}))
      const signal = new AbortController().signal
      await createHttpClient({ fetch }).post('/api/a', { x: 1 }, { signal })
      expect(fetch.mock.calls[0]![1].signal).toBe(signal)
    })

    it('forwards keepalive to fetch (a request that must outlive the page)', async () => {
      const fetch = vi.fn().mockResolvedValue(json(204, undefined))
      await createHttpClient({ fetch }).delete('/api/a', { keepalive: true })
      expect(fetch.mock.calls[0]![1].keepalive).toBe(true)
    })

    it('raises ApiError(0, "timeout") when the signal fires with a TimeoutError', async () => {
      const controller = new AbortController()
      const http = createHttpClient({ fetch: hangingFetch() })
      const pending = http.post('/api/a', {}, { signal: controller.signal }).catch((e) => e)
      controller.abort(new DOMException('signal timed out', 'TimeoutError'))
      const err = (await pending) as ApiError
      expect(err).toBeInstanceOf(ApiError)
      expect(err.status).toBe(0)
      expect(err.code).toBe('timeout')
    })

    it('a plain network failure is still ApiError(0, "network")', async () => {
      const http = createHttpClient({ fetch: vi.fn().mockRejectedValue(new TypeError('failed')) })
      const err = (await http.post('/api/a', {}, { signal: new AbortController().signal }).catch((e) => e)) as ApiError
      expect(err.code).toBe('network')
    })
  })
})

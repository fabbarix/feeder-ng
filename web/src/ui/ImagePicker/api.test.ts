import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageApi } from './api'

function stubFetch(status = 200, body: unknown = {}) {
  const fn = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('imageApi', () => {
  it('uploadDataUrl posts {dataUrl} to /api/images', async () => {
    const fetch = stubFetch(201, { id: 'x', url: '/api/images/x', width: 1, height: 1 })
    const out = await imageApi.uploadDataUrl('data:image/png;base64,AAAA')
    expect(out.id).toBe('x')
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/images')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ dataUrl: 'data:image/png;base64,AAAA' })
  })

  it('ingestUrl posts {url} to /api/images/from-url', async () => {
    const fetch = stubFetch(201, { id: 'y', url: '/api/images/y', width: 1, height: 1 })
    await imageApi.ingestUrl('https://photos.example/a.png')
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/images/from-url')
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://photos.example/a.png' })
  })

  it('passes the abort signal on', async () => {
    const fetch = stubFetch(201, { id: 'y' })
    const controller = new AbortController()
    await imageApi.uploadDataUrl('data:image/png;base64,AAAA', { signal: controller.signal })
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal)
  })

  it('discard sends DELETE /api/images/{id} and never throws (409 in use, 404, network)', async () => {
    const fetch = stubFetch(409, { error: { code: 'image_in_use', message: 'x' } })
    await expect(imageApi.discard('abc')).resolves.toBeUndefined()
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/images/abc')
    expect(init.method).toBe('DELETE')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    await expect(imageApi.discard('abc')).resolves.toBeUndefined()
  })

  it('loadBlob fetches the stored image with the session cookie', async () => {
    const fetch = vi.fn(async () => new Response(new Blob(['webp'], { type: 'image/webp' })))
    vi.stubGlobal('fetch', fetch)
    const blob = await imageApi.loadBlob('/api/images/abc')
    expect(blob.size).toBe(4)
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ credentials: 'same-origin' })
  })
})

// PPX: the sync uploads a queued Picture with the same endpoint the ImagePicker uses (POST /api/images {dataUrl}).
import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpClient } from '../../lib/http'
import { createScanApi } from './api'

const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('createScanApi.uploadPicture', () => {
  it('posts the Blob as a data URL to /api/images and answers the image id', async () => {
    const fetch = vi.fn(async () => json({ id: 'a'.repeat(32), url: '/api/images/' + 'a'.repeat(32), width: 40, height: 30 }))
    const id = await createScanApi(createHttpClient({ fetch })).uploadPicture(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
    expect(id).toBe('a'.repeat(32))
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/images')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ dataUrl: 'data:image/jpeg;base64,AQID' })
  })

  it('raises the server refusal as an ApiError with its status and code', async () => {
    const fetch = vi.fn(async () => json({ error: { code: 'image_too_large', message: 'A photo must be 8 MB or smaller' } }, 413))
    await expect(createScanApi(createHttpClient({ fetch })).uploadPicture(new Blob([new Uint8Array(3)], { type: 'image/jpeg' }))).rejects.toMatchObject({ status: 413, code: 'image_too_large' })
  })
})

// Review: the upload gets a timeout like the sync does (commit 4c9cf96), so a hung upload releases the queue lock and retries as offline.
describe('createScanApi.uploadPicture timeout', () => {
  const blob = () => new Blob([new Uint8Array(3)], { type: 'image/jpeg' })

  it('gives the request an abort signal from the injected timeoutSignal', async () => {
    const timeoutSignal = vi.fn((_ms: number) => new AbortController().signal)
    const fetch = vi.fn(async () => json({ id: 'a'.repeat(32), url: '', width: 1, height: 1 }))
    await createScanApi(createHttpClient({ fetch }), { timeoutSignal }).uploadPicture(blob())
    expect(timeoutSignal).toHaveBeenCalledTimes(1)
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.signal).toBe(timeoutSignal.mock.results[0]!.value)
  })

  it('a hanging upload is raised as ApiError(0, "timeout"), which the queue retries', async () => {
    const controller = new AbortController()
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))),
    )
    const api = createScanApi(createHttpClient({ fetch: hanging }), { timeoutSignal: () => controller.signal })
    const pending = api.uploadPicture(blob()).catch((e) => e)
    await vi.waitFor(() => expect(hanging).toHaveBeenCalledTimes(1))
    controller.abort(new DOMException('signal timed out', 'TimeoutError'))
    const err = await pending
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 0, code: 'timeout' })
  }, 1500)
})

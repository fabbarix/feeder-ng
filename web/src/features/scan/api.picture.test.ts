// PPX: the sync uploads a queued Picture with the same endpoint the ImagePicker uses (POST /api/images {dataUrl}).
import { describe, expect, it, vi } from 'vitest'
import { createHttpClient } from '../../lib/http'
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

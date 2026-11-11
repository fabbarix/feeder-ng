import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { fakeApi, fakeEngine, heicFile, hugeFile, ID_A, ID_B, pngFile, stored } from '../testing'
import { useImageIngest } from './useImageIngest'

function setup(over: { api?: ReturnType<typeof fakeApi>; engine?: ReturnType<typeof fakeEngine> } = {}) {
  const api = over.api ?? fakeApi()
  const engine = over.engine ?? fakeEngine()
  const onStored = vi.fn()
  const hook = renderHook(() => useImageIngest({ api, engine, onStored }))
  return { api, engine, onStored, ...hook }
}

describe('useImageIngest: files', () => {
  it('uploads a picture as a data URL and reports the stored id', async () => {
    const { result, api, onStored } = setup()
    await act(() => result.current.ingestBlob(pngFile(), 'file'))
    expect(api.uploadDataUrl).toHaveBeenCalledTimes(1)
    expect((api.uploadDataUrl.mock.calls[0] as unknown as [string])[0]).toMatch(/^data:image\/png;base64,/)
    expect(onStored).toHaveBeenCalledWith(ID_A)
    expect(result.current.busy).toBe(false)
    expect(result.current.problem).toBeNull()
  })

  it('goes through preparing, then uploading, then idle', async () => {
    let release!: (s: ReturnType<typeof stored>) => void
    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>((r) => (release = r))) })
    const { result } = setup({ api })
    let done!: Promise<void>
    act(() => {
      done = result.current.ingestBlob(pngFile(), 'drop')
    })
    await waitFor(() => expect(result.current.phase).toBe('uploading'))
    expect(result.current.busy).toBe(true)
    await act(async () => {
      release(stored(ID_A))
      await done
    })
    expect(result.current.phase).toBe('idle')
  })

  it('refuses a wrong type or an over-8-MB file before any request', async () => {
    const { result, api, onStored } = setup()
    await act(() => result.current.ingestBlob(new File(['x'], 'a.gif', { type: 'image/gif' }), 'file'))
    expect(result.current.problem).toBe('unsupported')
    await act(() => result.current.ingestBlob(hugeFile(), 'file'))
    expect(result.current.problem).toBe('too_large')
    expect(api.uploadDataUrl).not.toHaveBeenCalled()
    expect(onStored).not.toHaveBeenCalled()
  })

  it('shrinks a big picture to 3200 px before sending (a 200 MP phone photo would exceed the server cap)', async () => {
    const engine = fakeEngine({ width: 12000, height: 9000 })
    const { result, api } = setup({ engine })
    await act(() => result.current.ingestBlob(pngFile(), 'file'))
    expect(engine.encode.mock.calls[0]![1]).toMatchObject({ width: 3200, height: 2400 })
    expect(api.uploadDataUrl).toHaveBeenCalled()
  })

  it('a camera frame is always re-encoded, a rotation turns it', async () => {
    const engine = fakeEngine()
    const { result } = setup({ engine })
    await act(() => result.current.ingestBlob(pngFile(), 'camera'))
    expect(engine.encode).toHaveBeenCalledTimes(1)
    await act(() => result.current.ingestBlob(pngFile(), 'file', { turns: 1 }))
    expect(engine.encode.mock.calls[1]![1]).toMatchObject({ turns: 1, width: 600, height: 800 })
  })

  it('maps a server refusal to a problem and keeps going afterwards', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn().mockRejectedValueOnce(new ApiError(413, 'image_too_large', 'big')).mockResolvedValue(stored(ID_B)) })
    const { result, onStored } = setup({ api })
    await act(() => result.current.ingestBlob(pngFile(), 'file'))
    expect(result.current.problem).toBe('too_large')
    expect(onStored).not.toHaveBeenCalled()
    await act(() => result.current.ingestBlob(pngFile(), 'file'))
    expect(result.current.problem).toBeNull()
    expect(onStored).toHaveBeenCalledWith(ID_B)
  })

  it('HEIC goes to the server untouched (no decode, no re-encode), declared as image/heic; the stored result is a WebP like any other', async () => {
    const { result, api, engine, onStored } = setup()
    await act(() => result.current.ingestBlob(heicFile(), 'file'))
    expect(engine.decode).not.toHaveBeenCalled()
    expect(engine.encode).not.toHaveBeenCalled()
    expect((api.uploadDataUrl.mock.calls[0] as unknown as [string])[0]).toMatch(/^data:image\/heic;base64,/)
    expect(onStored).toHaveBeenCalledWith(ID_A)
  })

  it('a HEIC shows the converting phase while the server works on it (it can take seconds); other pictures still say uploading', async () => {
    let release!: (s: ReturnType<typeof stored>) => void
    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>((r) => (release = r))) })
    const { result } = setup({ api })
    let done!: Promise<void>
    act(() => {
      done = result.current.ingestBlob(heicFile(), 'file')
    })
    await waitFor(() => expect(result.current.phase).toBe('converting'))
    expect(result.current.busy).toBe(true)
    await act(async () => {
      release(stored(ID_A))
      await done
    })
    expect(result.current.phase).toBe('idle')
  })

  it('a picture the browser cannot decode is unreadable', async () => {
    const engine = fakeEngine()
    engine.decode.mockRejectedValue(new Error('heic'))
    const { result, api } = setup({ engine })
    await act(() => result.current.ingestBlob(pngFile(), 'file'))
    expect(result.current.problem).toBe('unreadable')
    expect(api.uploadDataUrl).not.toHaveBeenCalled()
  })
})

describe('useImageIngest: links', () => {
  it('sends a valid https link to the server, which downloads it', async () => {
    const { result, api, onStored } = setup()
    await act(() => result.current.ingestLink(' https://photos.example/soup.png '))
    expect(api.ingestUrl).toHaveBeenCalledTimes(1)
    expect((api.ingestUrl.mock.calls[0] as unknown as [string])[0]).toBe('https://photos.example/soup.png')
    expect(api.uploadDataUrl).not.toHaveBeenCalled()
    expect(onStored).toHaveBeenCalledWith(ID_B)
  })

  it('never sends an empty, http or private-looking-invalid link to the server', async () => {
    const { result, api } = setup()
    await act(() => result.current.ingestLink(''))
    expect(result.current.problem).toBe('link_empty')
    await act(() => result.current.ingestLink('http://photos.example/a.png'))
    expect(result.current.problem).toBe('link_invalid')
    expect(api.ingestUrl).not.toHaveBeenCalled()
  })

  it('a pasted data URL is uploaded like a file, not fetched', async () => {
    const { result, api } = setup()
    await act(() => result.current.ingestLink(`data:image/png;base64,${btoa('hello')}`))
    expect(api.ingestUrl).not.toHaveBeenCalled()
    expect(api.uploadDataUrl).toHaveBeenCalled()
  })

  it.each([
    ['image_url_blocked', 'link_blocked'],
    ['image_url_unreachable', 'link_unreachable'],
    ['unsupported_image', 'unsupported'],
    ['image_too_large', 'too_large'],
  ])('the server error %s is shown as %s', async (apiCode, expected) => {
    const api = fakeApi({ ingestUrl: vi.fn().mockRejectedValue(new ApiError(422, apiCode, 'x')) })
    const { result } = setup({ api })
    await act(() => result.current.ingestLink('https://photos.example/a.png'))
    expect(result.current.problem).toBe(expected)
  })

  it('reports the downloading phase while the server fetches', async () => {
    const api = fakeApi({ ingestUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>(() => {})) })
    const { result } = setup({ api })
    act(() => void result.current.ingestLink('https://photos.example/a.png'))
    await waitFor(() => expect(result.current.phase).toBe('downloading'))
  })
})

describe('useImageIngest: cancel, supersede, ownership', () => {
  it('cancel aborts the request in flight and reports nothing', async () => {
    let signal: AbortSignal | undefined
    const api = fakeApi({
      uploadDataUrl: vi.fn((_u: string, o?: { signal?: AbortSignal }) => {
        signal = o?.signal
        return new Promise<ReturnType<typeof stored>>((_, reject) => o?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      }),
    })
    const { result, onStored } = setup({ api })
    act(() => void result.current.ingestBlob(pngFile(), 'file'))
    await waitFor(() => expect(result.current.phase).toBe('uploading'))
    act(() => result.current.cancel())
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(signal?.aborted).toBe(true)
    expect(result.current.problem).toBeNull()
    expect(onStored).not.toHaveBeenCalled()
  })

  it('a newer pick supersedes an older one: the late result is ignored and its image is discarded', async () => {
    const resolvers: ((s: ReturnType<typeof stored>) => void)[] = []
    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>((r) => resolvers.push(r))) })
    const { result, onStored } = setup({ api })
    act(() => void result.current.ingestBlob(pngFile('one.png'), 'file'))
    await waitFor(() => expect(resolvers).toHaveLength(1))
    act(() => void result.current.ingestBlob(pngFile('two.png'), 'file'))
    await waitFor(() => expect(resolvers).toHaveLength(2))
    await act(async () => resolvers[1]!(stored(ID_B)))
    await act(async () => resolvers[0]!(stored(ID_A)))
    expect(onStored).toHaveBeenCalledTimes(1)
    expect(onStored).toHaveBeenCalledWith(ID_B)
    expect(api.discard).toHaveBeenCalledWith(ID_A)
  })

  it('remembers what it uploaded: only those ids can be discarded by the picker', async () => {
    const { result, api } = setup()
    await act(() => result.current.ingestBlob(pngFile(), 'file'))
    expect(result.current.isOwned(ID_A)).toBe(true)
    expect(result.current.isOwned(ID_B)).toBe(false)
    act(() => result.current.discardOwned(ID_B))
    expect(api.discard).not.toHaveBeenCalled()
    act(() => result.current.discardOwned(ID_A))
    expect(api.discard).toHaveBeenCalledWith(ID_A)
    expect(result.current.isOwned(ID_A)).toBe(false)
  })

  it('a successful pick clears the previous problem', async () => {
    const { result } = setup()
    await act(() => result.current.ingestBlob(new File(['x'], 'a.gif', { type: 'image/gif' }), 'file'))
    expect(result.current.problem).toBe('unsupported')
    await act(() => result.current.ingestBlob(pngFile(), 'file'))
    expect(result.current.problem).toBeNull()
  })
})

// RR4: the receipt's photos, in memory only (never in IndexedDB, ADR 0018): added from the camera or the library, prepared with the
// shared image pipeline, listed with a preview, removed, and turned into the read's body.
// Pinned API of ./useReceiptPhotos:
//   useReceiptPhotos(deps?: { engine?: ImageEngine; objectUrls?: { create(blob): string; revoke(url): void } }): UseReceiptPhotos
//   UseReceiptPhotos = {
//     photos: { id: string; previewUrl: string; dataUrl: string; width: number; height: number }[]   in the order added
//     count: number; canAdd: boolean (count < MAX_PHOTOS and not busy); busy: boolean (files are being prepared)
//     add(files: File[]): Promise<void>      prepares each in turn (prepareReceiptPhoto); keeps only as many as fit
//     remove(id: string): void               revokes its preview URL
//     clear(): void                          removes all
//     problem?: 'photo_unsupported' | 'photo_too_large' | 'too_many_photos'     the last thing that went wrong (the Import copy by code)
//     dismissProblem(): void
//     toBody(): { dataUrl: string }[]        the photos for the read, in order
//   }
// MAX_PHOTOS = 4 is exported by ../lib/preparePhoto.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ImageEngine } from '../../../ui/ImagePicker/lib/prepare'
import { MAX_PHOTOS } from '../lib/preparePhoto'
import { useReceiptPhotos } from './useReceiptPhotos'

const MIB = 1024 * 1024
function fakeEngine(over: { decode?: () => Promise<unknown>; size?: () => number } = {}): ImageEngine {
  return {
    decode: (over.decode ?? (async () => ({ width: 3000, height: 2000, close: () => undefined }))) as ImageEngine['decode'],
    encode: (async (_i: unknown, o: { type: string }) => new Blob([new Uint8Array(over.size?.() ?? 1000)], { type: o.type })) as unknown as ImageEngine['encode'],
  }
}
function fakeUrls() {
  let n = 0
  return { create: vi.fn(() => `blob:p/${++n}`), revoke: vi.fn() }
}
const files = (n: number) => Array.from({ length: n }, (_, i) => new File([new Uint8Array(10)], `r${i}.jpg`, { type: 'image/jpeg' }))
const setup = (engine = fakeEngine(), objectUrls = fakeUrls()) => ({ ...renderHook(() => useReceiptPhotos({ engine, objectUrls })), objectUrls })

describe('add', () => {
  it('starts empty and able to add', () => {
    const { result } = setup()
    expect(result.current).toMatchObject({ photos: [], count: 0, canAdd: true, busy: false, problem: undefined })
    expect(MAX_PHOTOS).toBe(4)
  })
  it('lists a prepared JPEG with a preview, in the order added', async () => {
    const { result } = setup()
    await act(async () => { await result.current.add(files(1)) })
    await act(async () => { await result.current.add(files(1)) })
    expect(result.current.count).toBe(2)
    const [a, b] = result.current.photos
    expect(a?.previewUrl).toBe('blob:p/1')
    expect(a?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(a?.id).not.toBe(b?.id)
    expect(Math.max(a!.width, a!.height)).toBeLessThanOrEqual(2576)
  })
  it('is busy while a file is prepared', async () => {
    let release!: (v: unknown) => void
    const { result } = setup(fakeEngine({ decode: () => new Promise((r) => { release = r }) }))
    let p!: Promise<void>
    act(() => { p = result.current.add(files(1)) })
    expect(result.current).toMatchObject({ busy: true, canAdd: false })
    await act(async () => { release({ width: 100, height: 100, close: () => undefined }); await p })
    expect(result.current).toMatchObject({ busy: false, count: 1 })
  })
  it('keeps at most 4 and says so', async () => {
    const { result } = setup()
    await act(async () => { await result.current.add(files(6)) })
    expect(result.current.count).toBe(4)
    expect(result.current.canAdd).toBe(false)
    expect(result.current.problem).toBe('too_many_photos')
  })
  it('adds nothing at 4', async () => {
    const { result } = setup()
    await act(async () => { await result.current.add(files(4)) })
    await act(async () => { await result.current.add(files(1)) })
    expect(result.current.count).toBe(4)
    expect(result.current.problem).toBe('too_many_photos')
  })
  it('a file that cannot be read is refused as photo_unsupported and the others stay', async () => {
    let n = 0
    const engine = fakeEngine({ decode: async () => { if (n++ === 0) throw new Error('bad'); return { width: 100, height: 100, close: () => undefined } } })
    const { result } = setup(engine)
    await act(async () => { await result.current.add(files(2)) })
    expect(result.current.count).toBe(1)
    expect(result.current.problem).toBe('photo_unsupported')
  })
  it('a photo that cannot be made small enough is photo_too_large', async () => {
    const { result } = setup(fakeEngine({ size: () => 9 * MIB }))
    await act(async () => { await result.current.add(files(1)) })
    expect(result.current.count).toBe(0)
    expect(result.current.problem).toBe('photo_too_large')
  })
  it('dismissProblem clears it', async () => {
    const { result } = setup(fakeEngine({ size: () => 9 * MIB }))
    await act(async () => { await result.current.add(files(1)) })
    act(() => result.current.dismissProblem())
    expect(result.current.problem).toBeUndefined()
  })
})

describe('remove, clear and the body', () => {
  it('remove takes one photo out and revokes its preview', async () => {
    const { result, objectUrls } = setup()
    await act(async () => { await result.current.add(files(3)) })
    const second = result.current.photos[1]!
    act(() => result.current.remove(second.id))
    expect(result.current.photos.map((p) => p.id)).not.toContain(second.id)
    expect(result.current.count).toBe(2)
    expect(objectUrls.revoke).toHaveBeenCalledWith(second.previewUrl)
    expect(result.current.canAdd).toBe(true)
  })
  it('clear removes all of them and revokes every preview', async () => {
    const { result, objectUrls } = setup()
    await act(async () => { await result.current.add(files(2)) })
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
    expect(objectUrls.revoke).toHaveBeenCalledTimes(2)
  })
  it('toBody lists {dataUrl} in order', async () => {
    const { result } = setup()
    await act(async () => { await result.current.add(files(2)) })
    const body = result.current.toBody()
    expect(body).toHaveLength(2)
    expect(body.map((b) => b.dataUrl)).toEqual(result.current.photos.map((p) => p.dataUrl))
    expect(Object.keys(body[0]!)).toEqual(['dataUrl'])
  })
  it('revokes the previews when the screen is left', async () => {
    const { result, unmount, objectUrls } = setup()
    await act(async () => { await result.current.add(files(2)) })
    unmount()
    expect(objectUrls.revoke).toHaveBeenCalledTimes(2)
  })
  it('never writes to IndexedDB or localStorage', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = setup()
    await act(async () => { await result.current.add(files(2)) })
    expect(set).not.toHaveBeenCalled()
    set.mockRestore()
  })
})

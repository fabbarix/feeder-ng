// Beta 7: a receipt photo is turned and cropped after it is taken.
// Pinned API added to ./useReceiptPhotos (UseReceiptPhotos):
//   applyEdit(id: string, edit: ImageEdit): Promise<boolean>
//     `edit` is the sheet's draft: quarter turns and a crop in pixels of the TURNED photo, whose own size is the item's width x height.
//     - prepares the CURRENT photo again with prepareReceiptPhoto(blob, engine, edit): JPEG, long edge <= 2576, <= 8 MiB, EXIF-free;
//     - the item keeps its id and its place; its previewUrl is a NEW object URL, its dataUrl, width and height are the edited image's;
//     - the old object URL is revoked exactly once, and the old image is not kept (the next edit starts from the edited one; no original);
//     - while it runs `busy` is true and `canAdd` false;
//     - resolves true when the photo was replaced; false (nothing changed, nothing revoked, nothing made) when
//         the edit is the whole, unturned picture (isFullEdit: no work), the id is unknown, or it failed;
//     - a failure sets `problem` ('photo_too_large' | 'photo_unsupported') and leaves the photo exactly as it was;
//     - after the screen is left, or when the photo was removed meanwhile, it makes no URL (nothing would revoke it) and changes nothing.
//   toBody() sends the edited dataUrl, in the same place.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ImageEdit } from '../../../ui'
import type { ImageEngine } from '../../../ui/ImageEditor/lib/prepare'
import { useReceiptPhotos } from './useReceiptPhotos'

const MIB = 1024 * 1024
/**
 * decode answers the size of the blob an encode made (3000 x 2000 for a file), so a second edit sees the first edit's output.
 * encode writes its options into the bytes, so each different encode has its own dataUrl.
 */
function fakeEngine(over: { size?: () => number; source?: { width: number; height: number } } = {}) {
  const made = new WeakMap<Blob, { width: number; height: number }>()
  const decoded: Blob[] = []
  const encoded: { width: number; height: number; turns: number; crop?: unknown; type: string }[] = []
  const engine: ImageEngine = {
    decode: (async (blob: Blob) => {
      decoded.push(blob)
      const s = made.get(blob) ?? over.source ?? { width: 3000, height: 2000 }
      return { ...s, close: () => undefined }
    }) as ImageEngine['decode'],
    encode: (async (_i: unknown, o: { width: number; height: number; turns: number; crop?: unknown; type: string }) => {
      encoded.push(o)
      // The bytes carry the encode's options, so two different edits never make the same dataUrl.
      const tag = new TextEncoder().encode(JSON.stringify({ turns: o.turns, crop: o.crop, width: o.width, height: o.height }))
      const bytes = new Uint8Array(Math.max(over.size?.() ?? 1000, tag.length))
      bytes.set(tag)
      const blob = new Blob([bytes], { type: o.type })
      made.set(blob, { width: o.width, height: o.height })
      return blob
    }) as unknown as ImageEngine['encode'],
  }
  return { engine, decoded, encoded }
}
function fakeUrls() {
  let n = 0
  return { create: vi.fn(() => `blob:p/${++n}`), revoke: vi.fn() }
}
const files = (n: number) => Array.from({ length: n }, (_, i) => new File([new Uint8Array(10)], `r${i}.jpg`, { type: 'image/jpeg' }))
function setup(over: Parameters<typeof fakeEngine>[0] = {}) {
  const e = fakeEngine(over)
  const objectUrls = fakeUrls()
  return { ...renderHook(() => useReceiptPhotos({ engine: e.engine, objectUrls })), objectUrls, ...e }
}
const turnRight = (w: number, h: number): ImageEdit => ({ turns: 1, crop: { x: 0, y: 0, width: h, height: w } })

describe('applyEdit', () => {
  it('replaces the photo in place: same id and order, a new preview, a new dataUrl, the edited size', async () => {
    const { result } = setup()
    await act(async () => { await result.current.add(files(3)) })
    const before = result.current.photos.map((p) => ({ ...p }))
    const target = before[1]!
    let ok = false
    await act(async () => { ok = await result.current.applyEdit(target.id, turnRight(target.width, target.height)) })
    expect(ok).toBe(true)
    const after = result.current.photos
    expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id))
    expect(after[0]).toEqual(before[0])
    expect(after[2]).toEqual(before[2])
    expect(after[1]!.previewUrl).not.toBe(target.previewUrl)
    expect([after[1]!.width, after[1]!.height]).toEqual([target.height, target.width])
    expect(after[1]!.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(result.current.count).toBe(3)
  })

  it('encodes with the edit: the turns, and a crop in pixels of the turned photo', async () => {
    const { result, encoded } = setup()
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    const crop = { x: 100, y: 50, width: 800, height: 600 }
    await act(async () => { await result.current.applyEdit(p.id, { turns: 2, crop }) })
    expect(encoded.at(-1)).toMatchObject({ turns: 2, crop, width: 800, height: 600, type: 'image/jpeg' })
    expect([result.current.photos[0]!.width, result.current.photos[0]!.height]).toEqual([800, 600])
  })

  it('revokes the old object URL once and makes one new one', async () => {
    const { result, objectUrls } = setup()
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    await act(async () => { await result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    expect(objectUrls.create).toHaveBeenCalledTimes(2)
    expect(objectUrls.revoke).toHaveBeenCalledTimes(1)
    expect(objectUrls.revoke).toHaveBeenCalledWith(p.previewUrl)
    expect(result.current.photos[0]!.previewUrl).toBe('blob:p/2')
  })

  it('toBody sends the edited dataUrl, in place', async () => {
    const { result } = setup()
    await act(async () => { await result.current.add(files(2)) })
    const [a, b] = result.current.photos
    await act(async () => { await result.current.applyEdit(a!.id, turnRight(a!.width, a!.height)) })
    const body = result.current.toBody()
    expect(body).toEqual([{ dataUrl: result.current.photos[0]!.dataUrl }, { dataUrl: b!.dataUrl }])
    expect(body[0]!.dataUrl).not.toBe(a!.dataUrl)
  })

  it('does not keep the original: a second edit starts from the edited image', async () => {
    const { result, decoded, encoded } = setup()
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    await act(async () => { await result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    const first = result.current.photos[0]!
    await act(async () => { await result.current.applyEdit(first.id, { turns: 0, crop: { x: 0, y: 0, width: 1000, height: 500 } }) })
    // The add decodes the File once; each edit decodes the previous OUTPUT (a Blob the pipeline made), never the File again.
    expect(decoded[0]).toBeInstanceOf(File)
    expect(decoded.slice(1).every((b) => !(b instanceof File))).toBe(true)
    expect(decoded).toHaveLength(3)
    expect(encoded).toHaveLength(3)
    expect([result.current.photos[0]!.width, result.current.photos[0]!.height]).toEqual([1000, 500])
  })

  it('keeps the long edge at 2576 and the file at 8 MiB or less', async () => {
    const { result } = setup({ source: { width: 6000, height: 4000 } })
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    await act(async () => { await result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    const q = result.current.photos[0]!
    expect(Math.max(q.width, q.height)).toBeLessThanOrEqual(2576)
    expect(q.height).toBeGreaterThan(q.width)
    const bytes = Math.floor((q.dataUrl.length - q.dataUrl.indexOf(',') - 1) * 0.75)
    expect(bytes).toBeLessThanOrEqual(8 * MIB)
  })

  it('is busy while it prepares, and cannot add meanwhile', async () => {
    let release!: () => void
    const e = fakeEngine()
    const realEncode = e.engine.encode
    let n = 0
    e.engine.encode = ((...a: Parameters<ImageEngine['encode']>) => (++n === 1 ? realEncode(...a) : new Promise((r) => { release = () => r(realEncode(...a)) }))) as ImageEngine['encode']
    const { result } = renderHook(() => useReceiptPhotos({ engine: e.engine, objectUrls: fakeUrls() }))
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    let pending!: Promise<boolean>
    act(() => { pending = result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    expect(result.current).toMatchObject({ busy: true, canAdd: false })
    await act(async () => { release(); await pending })
    expect(result.current).toMatchObject({ busy: false, canAdd: true })
  })

  it('an edit that is the whole, unturned photo does nothing: false, same URL, no encode', async () => {
    const { result, objectUrls, encoded } = setup()
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    let ok = true
    await act(async () => { ok = await result.current.applyEdit(p.id, { turns: 0, crop: { x: 0, y: 0, width: p.width, height: p.height } }) })
    expect(ok).toBe(false)
    expect(result.current.photos[0]).toEqual(p)
    expect(encoded).toHaveLength(1)
    expect(objectUrls.create).toHaveBeenCalledTimes(1)
    expect(objectUrls.revoke).not.toHaveBeenCalled()
  })

  it('an unknown id does nothing', async () => {
    const { result, objectUrls } = setup()
    await act(async () => { await result.current.add(files(1)) })
    let ok = true
    await act(async () => { ok = await result.current.applyEdit('nope', turnRight(10, 10)) })
    expect(ok).toBe(false)
    expect(objectUrls.revoke).not.toHaveBeenCalled()
  })

  it('a photo that cannot be made small enough is photo_too_large, and stays as it was', async () => {
    let big = false
    const { result, objectUrls } = setup({ size: () => (big ? 9 * MIB : 1000) })
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    big = true
    let ok = true
    await act(async () => { ok = await result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    expect(ok).toBe(false)
    expect(result.current.problem).toBe('photo_too_large')
    expect(result.current.photos[0]).toEqual(p)
    expect(objectUrls.revoke).not.toHaveBeenCalled()
    expect(objectUrls.create).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(false)
    expect(result.current.toBody()).toEqual([{ dataUrl: p.dataUrl }])
  })

  it('a photo that cannot be decoded again is photo_unsupported, and stays as it was', async () => {
    const e = fakeEngine()
    const decode = e.engine.decode
    let n = 0
    e.engine.decode = ((b: Blob) => (++n === 1 ? decode(b) : Promise.reject(new Error('bad')))) as ImageEngine['decode']
    const objectUrls = fakeUrls()
    const { result } = renderHook(() => useReceiptPhotos({ engine: e.engine, objectUrls }))
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    await act(async () => { await result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    expect(result.current.problem).toBe('photo_unsupported')
    expect(result.current.photos[0]).toEqual(p)
    expect(objectUrls.revoke).not.toHaveBeenCalled()
  })

  it('leaving the screen while it prepares makes no URL', async () => {
    const e = fakeEngine()
    const realEncode = e.engine.encode
    let n = 0
    let release!: () => void
    e.engine.encode = ((...a: Parameters<ImageEngine['encode']>) => (++n === 1 ? realEncode(...a) : new Promise((r) => { release = () => r(realEncode(...a)) }))) as ImageEngine['encode']
    const objectUrls = fakeUrls()
    const { result, unmount } = renderHook(() => useReceiptPhotos({ engine: e.engine, objectUrls }))
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    let pending!: Promise<boolean>
    act(() => { pending = result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    unmount()
    release()
    await pending
    expect(objectUrls.create).toHaveBeenCalledTimes(1)
    expect(objectUrls.revoke).toHaveBeenCalledTimes(1)
  })

  it('a photo removed while it prepares is not brought back, and no URL is made', async () => {
    const e = fakeEngine()
    const realEncode = e.engine.encode
    let n = 0
    let release!: () => void
    e.engine.encode = ((...a: Parameters<ImageEngine['encode']>) => (++n === 1 ? realEncode(...a) : new Promise((r) => { release = () => r(realEncode(...a)) }))) as ImageEngine['encode']
    const objectUrls = fakeUrls()
    const { result } = renderHook(() => useReceiptPhotos({ engine: e.engine, objectUrls }))
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    let pending!: Promise<boolean>
    act(() => { pending = result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    act(() => result.current.remove(p.id))
    await act(async () => { release(); expect(await pending).toBe(false) })
    expect(result.current.count).toBe(0)
    expect(objectUrls.create).toHaveBeenCalledTimes(1)
    expect(objectUrls.revoke).toHaveBeenCalledTimes(1)
  })

  it('every URL made is revoked exactly once, whether edited, removed, cleared or left', async () => {
    const { result, unmount, objectUrls } = setup()
    await act(async () => { await result.current.add(files(3)) })
    const [a, b] = result.current.photos
    await act(async () => { await result.current.applyEdit(a!.id, turnRight(a!.width, a!.height)) })
    const a2 = result.current.photos[0]!
    await act(async () => { await result.current.applyEdit(a2.id, { turns: 0, crop: { x: 0, y: 0, width: 500, height: 400 } }) })
    await act(async () => { await result.current.applyEdit(b!.id, turnRight(b!.width, b!.height)) })
    act(() => result.current.remove(b!.id))
    unmount()
    const made = objectUrls.create.mock.results.map((r) => r.value as string)
    const revoked = objectUrls.revoke.mock.calls.map((c) => c[0] as string)
    expect(made).toHaveLength(6)
    expect(new Set(revoked).size).toBe(revoked.length)
    expect([...revoked].sort()).toEqual([...made].sort())
  })

  it('never writes to IndexedDB or localStorage', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = setup()
    await act(async () => { await result.current.add(files(1)) })
    const p = result.current.photos[0]!
    await act(async () => { await result.current.applyEdit(p.id, turnRight(p.width, p.height)) })
    expect(set).not.toHaveBeenCalled()
    set.mockRestore()
  })
})

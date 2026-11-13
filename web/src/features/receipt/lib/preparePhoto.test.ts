// RR4: a receipt photo is prepared with the shared image pipeline (ui prepareImage): JPEG, long edge at most READ_MAX_SIDE (2576),
// and at most 8 MiB decoded (the server's per-photo limit, internal/imaging MaxBytes), as a data URL.
// Pinned API of ./preparePhoto:
//   prepareReceiptPhoto(file: Blob, engine: ImageEngine): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }>
//   Rejects with ImageEditorError ('unreadable' when it cannot be decoded, 'too_large' when no quality fits).
//   RECEIPT_MAX_BYTES (= 8 * 1024 * 1024), RECEIPT_MAX_SIDE (= 2576)
import { describe, expect, it, vi } from 'vitest'
import type { ImageEngine } from '../../../ui/ImagePicker/lib/prepare'
import { prepareReceiptPhoto, RECEIPT_MAX_BYTES, RECEIPT_MAX_SIDE } from './preparePhoto'

const MIB = 1024 * 1024

function engine(sizeAt: (quality: number, type: string) => number, size = { width: 4000, height: 3000 }) {
  const encode = vi.fn(async (_img: unknown, o: { width: number; height: number; type: string; quality: number }) => new Blob([new Uint8Array(sizeAt(o.quality, o.type))], { type: o.type }))
  const close = vi.fn()
  const e: ImageEngine = {
    decode: vi.fn(async () => ({ width: size.width, height: size.height, close })),
    encode: encode as unknown as ImageEngine['encode'],
  }
  return { e, encode, close }
}
const file = (type: string, bytes = 100) => new Blob([new Uint8Array(bytes)], { type })

describe('constants', () => {
  it('respect the backend: 8 MiB per photo, 2576 px', () => {
    expect(RECEIPT_MAX_BYTES).toBeLessThanOrEqual(8 * MIB)
    expect(RECEIPT_MAX_SIDE).toBe(2576)
  })
})

describe('prepareReceiptPhoto', () => {
  it('shrinks a large photo to the long edge, as a JPEG data URL', async () => {
    const { e, encode } = engine(() => 500_000)
    const out = await prepareReceiptPhoto(file('image/jpeg', 6 * MIB), e)
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2576)
    expect(out.width / out.height).toBeCloseTo(4000 / 3000, 1)
    expect(encode.mock.calls[0]?.[1]).toMatchObject({ type: 'image/jpeg' })
    expect(out.blob.type).toBe('image/jpeg')
    expect(out.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })
  it('always re-encodes, so a camera photo loses its metadata and location (ADR 0018)', async () => {
    const { e, encode } = engine(() => 1000, { width: 1000, height: 800 })
    await prepareReceiptPhoto(file('image/jpeg', 2000), e)
    expect(encode).toHaveBeenCalled()
  })
  it('turns a PNG into a JPEG', async () => {
    const { e, encode } = engine(() => 1000, { width: 1000, height: 800 })
    const out = await prepareReceiptPhoto(file('image/png'), e)
    expect(out.blob.type).toBe('image/jpeg')
    expect(encode.mock.calls.every((c) => (c[1] as { type: string }).type === 'image/jpeg')).toBe(true)
  })
  it('lowers the quality until the photo fits 8 MiB', async () => {
    const { e, encode } = engine((q) => (q >= 0.9 ? 9 * MIB : q >= 0.8 ? 7 * MIB : 3 * MIB))
    const out = await prepareReceiptPhoto(file('image/jpeg'), e)
    expect(out.blob.size).toBeLessThanOrEqual(8 * MIB)
    expect(encode.mock.calls.length).toBeGreaterThan(1)
  })
  it('rejects with too_large when no quality fits', async () => {
    const { e } = engine(() => 9 * MIB)
    await expect(prepareReceiptPhoto(file('image/jpeg'), e)).rejects.toMatchObject({ code: 'too_large' })
  })
  it('rejects with unreadable when the browser cannot decode it', async () => {
    const e: ImageEngine = { decode: vi.fn(async () => { throw new Error('nope') }), encode: vi.fn() as unknown as ImageEngine['encode'] }
    await expect(prepareReceiptPhoto(file('image/heic'), e)).rejects.toMatchObject({ code: 'unreadable' })
  })
  it('always closes the decoded picture', async () => {
    const { e, close } = engine(() => 1000)
    await prepareReceiptPhoto(file('image/jpeg'), e)
    expect(close).toHaveBeenCalled()
  })
})

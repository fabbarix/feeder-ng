// Beta 7: a receipt photo is edited (turned, cropped) and prepared again, with the same pipeline and limits.
// Pinned API added to ./preparePhoto:
//   prepareReceiptPhoto(file: Blob, engine: ImageEngine, edit?: ImageEdit): Promise<ReceiptPhoto>
//   `edit` (ui ImageEdit: { turns, crop }, crop in pixels of the TURNED picture) is passed to prepareImage as { turns, crop }; with no edit nothing changes.
//   The result is always a JPEG, long edge of the OUTPUT at most RECEIPT_MAX_SIDE, at most RECEIPT_MAX_BYTES; width and height are the output's.
import { describe, expect, it, vi } from 'vitest'
import type { ImageEngine } from '../../../ui/ImageEditor/lib/prepare'
import { prepareReceiptPhoto, RECEIPT_MAX_BYTES } from './preparePhoto'

function engine(size = { width: 3000, height: 2000 }, bytes = () => 1000) {
  const encode = vi.fn(async (_i: unknown, o: { type: string }) => new Blob([new Uint8Array(bytes())], { type: o.type }))
  const e: ImageEngine = { decode: vi.fn(async () => ({ ...size, close: () => undefined })), encode: encode as unknown as ImageEngine['encode'] }
  return { e, encode }
}
const file = new Blob([new Uint8Array(100)], { type: 'image/jpeg' })

describe('prepareReceiptPhoto with an edit', () => {
  it('turns the picture: the output has the turned shape', async () => {
    // Within the 2576 long-edge cap, so the turned shape is the whole output (the cap has its own test below).
    const { e, encode } = engine({ width: 2400, height: 1600 })
    const out = await prepareReceiptPhoto(file, e, { turns: 1, crop: { x: 0, y: 0, width: 1600, height: 2400 } })
    expect(encode.mock.calls[0]?.[1]).toMatchObject({ turns: 1, type: 'image/jpeg', width: 1600, height: 2400 })
    expect([out.width, out.height]).toEqual([1600, 2400])
  })
  it('crops: only that area is encoded, at its own size', async () => {
    const { e, encode } = engine()
    const out = await prepareReceiptPhoto(file, e, { turns: 0, crop: { x: 100, y: 200, width: 1000, height: 600 } })
    expect(encode.mock.calls[0]?.[1]).toMatchObject({ turns: 0, crop: { x: 100, y: 200, width: 1000, height: 600 }, width: 1000, height: 600 })
    expect([out.width, out.height]).toEqual([1000, 600])
    expect(out.blob.type).toBe('image/jpeg')
    expect(out.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })
  it('keeps the long edge of the output at 2576 (a crop of a big picture is scaled down)', async () => {
    const { e } = engine({ width: 6000, height: 4000 })
    const out = await prepareReceiptPhoto(file, e, { turns: 3, crop: { x: 0, y: 0, width: 4000, height: 6000 } })
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2576)
    expect(out.height / out.width).toBeCloseTo(6000 / 4000, 1)
  })
  it('keeps to 8 MiB: too large at every quality is ImageEditorError too_large', async () => {
    const { e } = engine({ width: 3000, height: 2000 }, () => RECEIPT_MAX_BYTES + 1)
    await expect(prepareReceiptPhoto(file, e, { turns: 1, crop: { x: 0, y: 0, width: 2000, height: 3000 } })).rejects.toMatchObject({ code: 'too_large' })
  })
  it('an edit that is the whole, unturned picture is still re-encoded to JPEG', async () => {
    const { e, encode } = engine({ width: 1000, height: 800 })
    await prepareReceiptPhoto(file, e, { turns: 0, crop: { x: 0, y: 0, width: 1000, height: 800 } })
    expect(encode).toHaveBeenCalled()
  })
  it('without an edit it prepares as before (no turn, no crop)', async () => {
    const { e, encode } = engine()
    await prepareReceiptPhoto(file, e)
    expect(encode.mock.calls[0]?.[1]).toMatchObject({ turns: 0 })
    expect(encode.mock.calls[0]?.[1]).not.toHaveProperty('crop')
  })
})

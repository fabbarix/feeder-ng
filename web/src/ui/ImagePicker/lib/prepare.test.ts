import { describe, expect, it } from 'vitest'
import { fakeEngine } from '../testing'
import { addTurn, fitWithin, prepareImage, turnedSize } from './prepare'

const MB = 1 << 20
const blob = (type = 'image/jpeg', bytes = 1000) => new Blob([new Uint8Array(bytes)], { type })

describe('fitWithin', () => {
  it('never upscales', () => expect(fitWithin(800, 600, 2576)).toEqual({ width: 800, height: 600 }))
  it('scales the long edge down to max, keeping the ratio', () => {
    expect(fitWithin(4000, 3000, 2576)).toEqual({ width: 2576, height: 1932 })
    expect(fitWithin(3000, 4000, 2576)).toEqual({ width: 1932, height: 2576 })
  })
  it('matches the server (internal/imaging ScaledSize) for 1600', () => expect(fitWithin(3000, 2000, 1600)).toEqual({ width: 1600, height: 1067 }))
  it('keeps at least one pixel on the short side', () => expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 }))
  it('an exact fit is unchanged', () => expect(fitWithin(2576, 100, 2576)).toEqual({ width: 2576, height: 100 }))
})

describe('turns', () => {
  it('addTurn wraps around in both directions', () => {
    expect(addTurn(0, 1)).toBe(1)
    expect(addTurn(3, 1)).toBe(0)
    expect(addTurn(0, -1)).toBe(3)
    expect(addTurn(2, -1)).toBe(1)
  })
  it('odd turns swap width and height', () => {
    expect(turnedSize(400, 300, 0)).toEqual({ width: 400, height: 300 })
    expect(turnedSize(400, 300, 1)).toEqual({ width: 300, height: 400 })
    expect(turnedSize(400, 300, 2)).toEqual({ width: 400, height: 300 })
    expect(turnedSize(400, 300, 3)).toEqual({ width: 300, height: 400 })
  })
})

describe('prepareImage', () => {
  const opts = { maxSide: 2576, maxBytes: 8 * MB }

  it('returns the ORIGINAL blob untouched when nothing has to change', async () => {
    const engine = fakeEngine({ width: 800, height: 600 })
    const original = blob('image/png', 5000)
    const out = await prepareImage(original, opts, engine)
    expect(out.blob).toBe(original)
    expect(out).toMatchObject({ width: 800, height: 600, type: 'image/png', reencoded: false })
    expect(engine.encode).not.toHaveBeenCalled()
  })

  it('downscales a big picture to the long edge and re-encodes it as JPEG', async () => {
    const engine = fakeEngine({ width: 4000, height: 3000 })
    const out = await prepareImage(blob('image/jpeg'), opts, engine)
    expect(engine.encode).toHaveBeenCalledTimes(1)
    expect(engine.encode.mock.calls[0]![1]).toMatchObject({ width: 2576, height: 1932, turns: 0, type: 'image/jpeg', quality: 0.9 })
    expect(out).toMatchObject({ width: 2576, height: 1932, type: 'image/jpeg', reencoded: true })
  })

  it('a PNG stays a PNG, a WebP becomes a JPEG', async () => {
    const png = fakeEngine({ width: 4000, height: 3000 })
    expect((await prepareImage(blob('image/png'), opts, png)).type).toBe('image/png')
    const webp = fakeEngine({ width: 4000, height: 3000 })
    expect((await prepareImage(blob('image/webp'), opts, webp)).type).toBe('image/jpeg')
  })

  it('a rotation always re-encodes and swaps the size', async () => {
    const engine = fakeEngine({ width: 800, height: 600 })
    const out = await prepareImage(blob(), { ...opts, turns: 1 }, engine)
    expect(engine.encode.mock.calls[0]![1]).toMatchObject({ width: 600, height: 800, turns: 1 })
    expect(out).toMatchObject({ width: 600, height: 800, reencoded: true })
  })

  it('rotates before it fits: a 4000x1000 picture turned once is 1000x4000, fitted to 2576', async () => {
    const engine = fakeEngine({ width: 4000, height: 1000 })
    const out = await prepareImage(blob(), { ...opts, turns: 1 }, engine)
    expect(out).toMatchObject({ width: 644, height: 2576 })
  })

  it('forceEncode re-encodes even an untouched picture (a camera frame)', async () => {
    const engine = fakeEngine()
    const out = await prepareImage(blob(), { ...opts, forceEncode: true }, engine)
    expect(out.reencoded).toBe(true)
  })

  it('re-encodes a picture that fits in pixels but not in bytes, lowering the quality until it fits', async () => {
    const engine = fakeEngine({ width: 800, height: 600 })
    const sizes = [9 * MB, 9 * MB, 1 * MB]
    engine.encode.mockImplementation(async (_i: unknown, o: { type: string }) => blob(o.type, sizes.shift()!))
    const out = await prepareImage(blob('image/jpeg', 9 * MB), opts, engine)
    expect(engine.encode.mock.calls.map((c) => c[1].quality)).toEqual([0.9, 0.8, 0.7])
    expect(out.blob.size).toBe(1 * MB)
  })

  it('gives up with too_large when even quality 0.6 is over the limit', async () => {
    const engine = fakeEngine({ width: 800, height: 600 })
    engine.encode.mockImplementation(async (_i: unknown, o: { type: string }) => blob(o.type, 9 * MB))
    await expect(prepareImage(blob('image/jpeg', 9 * MB), opts, engine)).rejects.toMatchObject({ code: 'too_large' })
    expect(engine.encode.mock.calls.map((c) => c[1].quality)).toEqual([0.9, 0.8, 0.7, 0.6])
  })

  it('a PNG that is too big is retried as a JPEG', async () => {
    const engine = fakeEngine({ width: 800, height: 600 })
    engine.encode.mockImplementation(async (_i: unknown, o: { type: string }) => blob(o.type, o.type === 'image/png' ? 9 * MB : MB))
    const out = await prepareImage(blob('image/png', 9 * MB), opts, engine)
    expect(out.type).toBe('image/jpeg')
  })

  it('a picture the browser cannot decode (HEIC) is unreadable', async () => {
    const engine = fakeEngine()
    engine.decode.mockRejectedValue(new Error('decode'))
    await expect(prepareImage(blob('image/heic'), opts, engine)).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('closes the decoded picture on success and on failure', async () => {
    const ok = fakeEngine({ width: 4000, height: 3000 })
    await prepareImage(blob(), opts, ok)
    expect(ok.decoded[0]!.close).toHaveBeenCalledTimes(1)
    const bad = fakeEngine({ width: 4000, height: 3000 })
    bad.encode.mockRejectedValue(new Error('canvas'))
    await expect(prepareImage(blob(), opts, bad)).rejects.toBeInstanceOf(Error)
    expect(bad.decoded[0]!.close).toHaveBeenCalledTimes(1)
  })
})

describe('prepareImage: crop', () => {
  const opts = { maxSide: 2576, maxBytes: 8 * MB }

  it('keeps only the crop: the output is the crop size and the engine is told which area to draw', async () => {
    const engine = fakeEngine({ width: 4000, height: 3000 })
    const out = await prepareImage(blob(), { ...opts, crop: { x: 500, y: 250, width: 2000, height: 1500 } }, engine)
    expect(engine.encode).toHaveBeenCalledTimes(1)
    expect(engine.encode.mock.calls[0]![1]).toMatchObject({ width: 2000, height: 1500, turns: 0, crop: { x: 500, y: 250, width: 2000, height: 1500 }, type: 'image/jpeg' })
    expect(out).toMatchObject({ width: 2000, height: 1500, reencoded: true })
  })

  it('downscales the CROP (not the whole picture) to the long edge', async () => {
    const engine = fakeEngine({ width: 4000, height: 3000 })
    const out = await prepareImage(blob(), { ...opts, crop: { x: 0, y: 0, width: 3600, height: 3000 } }, engine)
    expect(engine.encode.mock.calls[0]![1]).toMatchObject({ width: 2576, height: 2147 })
    expect(out).toMatchObject({ width: 2576, height: 2147 })
  })

  it('a small crop of a huge picture is not scaled up', async () => {
    const engine = fakeEngine({ width: 8000, height: 6000 })
    const out = await prepareImage(blob(), { ...opts, maxSide: 3200, crop: { x: 100, y: 100, width: 640, height: 480 } }, engine)
    expect(out).toMatchObject({ width: 640, height: 480 })
  })

  it('the crop is in turned pixels: 4000x1000 turned once is 1000x4000, and the engine gets the turn and the crop together', async () => {
    const engine = fakeEngine({ width: 4000, height: 1000 })
    const out = await prepareImage(blob(), { ...opts, turns: 1, crop: { x: 0, y: 1000, width: 1000, height: 2000 } }, engine)
    expect(engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 1, crop: { x: 0, y: 1000, width: 1000, height: 2000 }, width: 1000, height: 2000 })
    expect(out).toMatchObject({ width: 1000, height: 2000 })
  })

  it('a crop that is the whole picture is no crop: an untouched small picture is returned as it is', async () => {
    const engine = fakeEngine({ width: 800, height: 600 })
    const original = blob('image/png', 5000)
    const out = await prepareImage(original, { ...opts, crop: { x: 0, y: 0, width: 800, height: 600 } }, engine)
    expect(out.blob).toBe(original)
    expect(out.reencoded).toBe(false)
    expect(engine.encode).not.toHaveBeenCalled()
  })

  it('a crop that sticks out is shifted back inside the picture', async () => {
    const engine = fakeEngine({ width: 800, height: 600 })
    await prepareImage(blob(), { ...opts, crop: { x: 700, y: 0, width: 500, height: 600 } }, engine)
    expect(engine.encode.mock.calls[0]![1]).toMatchObject({ crop: { x: 300, y: 0, width: 500, height: 600 }, width: 500, height: 600 })
  })

  it('a PNG stays a PNG when cropped; the quality ladder still applies', async () => {
    const png = fakeEngine({ width: 800, height: 600 })
    expect((await prepareImage(blob('image/png'), { ...opts, crop: { x: 0, y: 0, width: 400, height: 300 } }, png)).type).toBe('image/png')
    const jpg = fakeEngine({ width: 800, height: 600 })
    const sizes = [9 * MB, 1 * MB]
    jpg.encode.mockImplementation(async (_i: unknown, o: { type: string }) => blob(o.type, sizes.shift()!))
    await prepareImage(blob('image/jpeg', 9 * MB), { ...opts, crop: { x: 0, y: 0, width: 400, height: 300 } }, jpg)
    expect(jpg.encode.mock.calls.map((c) => c[1].quality)).toEqual([0.9, 0.8])
  })

  it('a HEIC the browser can decode (Safari) is re-encoded as JPEG; one it cannot is unreadable', async () => {
    const ok = fakeEngine({ width: 4000, height: 3000 })
    expect((await prepareImage(blob('image/heic'), opts, ok)).type).toBe('image/jpeg')
    const bad = fakeEngine()
    bad.decode.mockRejectedValue(new Error('no HEIC'))
    await expect(prepareImage(blob('image/heic'), opts, bad)).rejects.toMatchObject({ code: 'unreadable' })
  })
})

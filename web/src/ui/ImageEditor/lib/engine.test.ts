import { describe, expect, it, vi } from 'vitest'
import { app1Exif, jpeg, sof } from './bytes.test-helper'
import { TooManyPixelsError, createImageEngine, type EngineDeps, type WorkingDraw } from './engine'
import type { Orientation } from './exif'
import { readJpegInfo } from './exif'
import type { DecodedImage } from './prepare'

const MB = 1024 * 1024
const headOf = async (blob: Blob) => new Uint8Array(await new Promise<ArrayBuffer>((res) => {
  const r = new FileReader()
  r.onload = () => res(r.result as ArrayBuffer)
  r.readAsArrayBuffer(blob)
}))

/** A JPEG blob with the given orientation and stored size, padded to `bytes`. */
const jpegBlob = (o: Orientation, w: number, h: number, bytes = 1000) => {
  const b = jpeg(app1Exif({ value: o }), sof(0xc0, w, h))
  const pad = new Uint8Array(Math.max(0, bytes - b.length))
  return new Blob([b, pad], { type: 'image/jpeg' })
}

interface Harness {
  deps: Partial<EngineDeps>
  decode: ReturnType<typeof vi.fn>
  draws: WorkingDraw[]
  closed: DecodedImage[]
  drawn: Blob[]
}

/**
 * A fake browser. `applies`: whether its decode applies EXIF (it then swaps the stored size for orientations 5..8).
 * The decoder reads the stored size and orientation from the blob's own JPEG header, so the probe image is decoded by the same rule.
 */
function harness(applies: boolean, opts: { fail?: boolean } = {}): Harness {
  const closed: DecodedImage[] = []
  const draws: WorkingDraw[] = []
  const drawn: Blob[] = []
  const decode = vi.fn(async (blob: Blob): Promise<DecodedImage> => {
    if (opts.fail) throw new Error('cannot decode')
    const info = readJpegInfo(await headOf(blob))
    const swap = applies && info.orientation >= 5
    const w = info.width ?? 100
    const h = info.height ?? 100
    const img: DecodedImage = { width: swap ? h : w, height: swap ? w : h, close: () => void closed.push(img) }
    return img
  })
  const drawWorking = vi.fn(async (_img: DecodedImage, o: WorkingDraw) => {
    draws.push(o)
    const b = new Blob(['drawn'], { type: 'image/jpeg' })
    drawn.push(b)
    return b
  })
  const base = { decode: vi.fn(async () => ({ width: 1, height: 1, close() {} })), encode: vi.fn(async () => new Blob(['x'])) }
  return { deps: { decode, drawWorking, base }, decode, draws, closed, drawn }
}

describe('browserOrients (the probe)', () => {
  it('decodes a built-in 2 x 1 JPEG carrying orientation 6', async () => {
    const h = harness(true)
    await createImageEngine(h.deps).browserOrients()
    expect(h.decode).toHaveBeenCalledTimes(1)
    const probe = h.decode.mock.calls[0]![0] as Blob
    expect(readJpegInfo(await headOf(probe))).toEqual({ orientation: 6, width: 2, height: 1 })
  })
  it('is true when the result is 1 x 2', async () => expect(await createImageEngine(harness(true).deps).browserOrients()).toBe(true))
  it('is false when the result stays 2 x 1', async () => expect(await createImageEngine(harness(false).deps).browserOrients()).toBe(false))
  it('is false when the probe cannot be decoded', async () => {
    expect(await createImageEngine(harness(true, { fail: true }).deps).browserOrients()).toBe(false)
  })
  it('closes the probe bitmap', async () => {
    const h = harness(true)
    await createImageEngine(h.deps).browserOrients()
    expect(h.closed).toHaveLength(1)
  })
  it('probes once per engine: later calls and concurrent calls share the result', async () => {
    const h = harness(true)
    const e = createImageEngine(h.deps)
    const [a, b] = await Promise.all([e.browserOrients(), e.browserOrients()])
    await e.browserOrients()
    expect([a, b]).toEqual([true, true])
    expect(h.decode).toHaveBeenCalledTimes(1)
  })
  it('can be set by the test (browserOrients dep) without decoding', async () => {
    const h = harness(false)
    const e = createImageEngine({ ...h.deps, browserOrients: true })
    expect(await e.browserOrients()).toBe(true)
    expect(h.decode).not.toHaveBeenCalled()
  })
})

describe('readHead', () => {
  it('returns the first 128 KB of a larger blob', async () => {
    const big = new Uint8Array(200 * 1024).map((_, i) => i & 255)
    const head = await createImageEngine(harness(true).deps).readHead(new Blob([big]))
    expect(head.length).toBe(131072)
    expect(Array.from(head.subarray(0, 4))).toEqual([0, 1, 2, 3])
    expect(head[131071]).toBe(131071 & 255)
  })
  it('returns a smaller blob whole', async () => {
    const head = await createImageEngine(harness(true).deps).readHead(new Blob([new Uint8Array([1, 2, 3])]))
    expect(Array.from(head)).toEqual([1, 2, 3])
  })
  it('returns an empty array for an empty blob', async () => {
    expect((await createImageEngine(harness(true).deps).readHead(new Blob([]))).length).toBe(0)
  })
})

describe('normalise: keep the original', () => {
  it('keeps an upright JPEG that fits, byte for byte, without drawing', async () => {
    const h = harness(true)
    const blob = jpegBlob(1, 4000, 3000, 3 * MB)
    const w = await createImageEngine(h.deps).normalise(blob)
    expect(w).toMatchObject({ blob, width: 4000, height: 3000, kept: true, original: { width: 4000, height: 3000 } })
    expect(h.draws).toHaveLength(0)
    expect(h.closed).toHaveLength(2) // the probe and the photo
  })
  it('does not keep a JPEG over 8 MB: draws a JPEG working copy', async () => {
    const h = harness(true)
    const w = await createImageEngine(h.deps).normalise(jpegBlob(1, 4000, 3000, 8 * MB + 1))
    expect(w.kept).toBe(false)
    expect(h.draws).toHaveLength(1)
    expect(w.blob).toBe(h.drawn[0])
  })
})

describe('normalise: drawing the working copy', () => {
  it('shrinks to workingSize and encodes JPEG 0.92 on a white background', async () => {
    const h = harness(true)
    const w = await createImageEngine(h.deps).normalise(jpegBlob(1, 8064, 6048, 12 * MB))
    expect(h.draws).toEqual([{ width: 4096, height: 3072, turns: 0, mirror: false, type: 'image/jpeg', quality: 0.92, background: '#fff' }])
    expect(w).toMatchObject({ width: 4096, height: 3072, kept: false, original: { width: 8064, height: 6048 } })
  })
  it('a PNG always gets a JPEG working copy', async () => {
    const h = harness(true)
    // not a JPEG: the decoder fake reads no header, so it reports 100 x 100
    const w = await createImageEngine(h.deps).normalise(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], { type: 'image/png' }))
    expect(w.kept).toBe(false)
    expect(h.draws[0]).toMatchObject({ type: 'image/jpeg', quality: 0.92, turns: 0, mirror: false })
  })
  it('browser applies EXIF: draws the already upright bitmap with no turns', async () => {
    const h = harness(true)
    const w = await createImageEngine(h.deps).normalise(jpegBlob(6, 400, 300))
    expect(h.draws[0]).toMatchObject({ width: 300, height: 400, turns: 0, mirror: false })
    expect(w).toMatchObject({ width: 300, height: 400, kept: false })
  })
  it('browser does not apply EXIF: draws with orientationOps and the upright size', async () => {
    const table: Record<number, { turns: number; mirror: boolean; swap: boolean }> = {
      2: { turns: 0, mirror: true, swap: false },
      3: { turns: 2, mirror: false, swap: false },
      4: { turns: 2, mirror: true, swap: false },
      5: { turns: 1, mirror: true, swap: true },
      6: { turns: 1, mirror: false, swap: true },
      7: { turns: 3, mirror: true, swap: true },
      8: { turns: 3, mirror: false, swap: true },
    }
    for (const [o, t] of Object.entries(table)) {
      const h = harness(false)
      const w = await createImageEngine(h.deps).normalise(jpegBlob(Number(o) as Orientation, 400, 300))
      expect(h.draws[0]).toMatchObject({ turns: t.turns, mirror: t.mirror, width: t.swap ? 300 : 400, height: t.swap ? 400 : 300 })
      expect(w.kept).toBe(false)
    }
  })
  it('orientation 6 is never kept, whatever the probe says', async () => {
    for (const applies of [true, false]) {
      const w = await createImageEngine(harness(applies).deps).normalise(jpegBlob(6, 400, 300))
      expect(w.kept).toBe(false)
    }
  })
  it('a manual orientation is shrunk too (the upright size goes through workingSize)', async () => {
    const h = harness(false)
    const w = await createImageEngine(h.deps).normalise(jpegBlob(6, 8064, 6048, 12 * MB))
    expect(w).toMatchObject({ width: 3072, height: 4096, original: { width: 6048, height: 8064 } })
    expect(h.draws[0]).toMatchObject({ width: 3072, height: 4096, turns: 1 })
  })
  it('closes the decoded bitmap after drawing, and when drawing fails', async () => {
    const h = harness(true)
    await createImageEngine(h.deps).normalise(jpegBlob(6, 400, 300))
    expect(h.closed).toHaveLength(2)
    const h2 = harness(true)
    const failing = createImageEngine({ ...h2.deps, drawWorking: async () => { throw new Error('canvas') } })
    await expect(failing.normalise(jpegBlob(6, 400, 300))).rejects.toThrow('canvas')
    expect(h2.closed).toHaveLength(2)
  })
})

describe('normalise: failures', () => {
  it('rejects with the decoder error and draws nothing', async () => {
    const h = harness(true)
    const e = createImageEngine({ ...h.deps, browserOrients: true, decode: async () => { throw new Error('cannot decode') } })
    await expect(e.normalise(new Blob(['heic'], { type: 'image/heic' }))).rejects.toThrow('cannot decode')
    expect(h.draws).toHaveLength(0)
  })
  it('rejects with TooManyPixelsError over opts.maxPixels, closes the bitmap and draws nothing', async () => {
    const h = harness(true)
    const e = createImageEngine({ ...h.deps, browserOrients: true })
    await expect(e.normalise(jpegBlob(1, 10000, 6000), { maxPixels: 50_000_000 })).rejects.toBeInstanceOf(TooManyPixelsError)
    expect(h.draws).toHaveLength(0)
    expect(h.closed).toHaveLength(1)
  })
  it('accepts exactly maxPixels', async () => {
    const e = createImageEngine({ ...harness(true).deps, browserOrients: true })
    await expect(e.normalise(jpegBlob(1, 10000, 5000), { maxPixels: 50_000_000 })).resolves.toMatchObject({ kept: false, width: 4096, height: 2048 })
  })
})

describe('decode and encode', () => {
  it('delegate to the base engine (the final render)', async () => {
    const h = harness(true)
    const e = createImageEngine(h.deps)
    const blob = new Blob(['x'])
    const img = await e.decode(blob)
    expect(h.deps.base!.decode).toHaveBeenCalledWith(blob)
    const o = { width: 1, height: 1, turns: 0 as const, type: 'image/jpeg' as const, quality: 0.9 }
    await e.encode(img, o)
    expect(h.deps.base!.encode).toHaveBeenCalledWith(img, o)
  })
})

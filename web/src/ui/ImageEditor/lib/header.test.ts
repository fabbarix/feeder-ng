import { describe, expect, it } from 'vitest'
import { app1Exif, ascii, bytes, jpeg, sof, u24le, u32be, u32le, u16le } from './bytes.test-helper'
import { readHeaderSize, readPngSize, readWebpSize } from './header'

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const png = (w: number, h: number, chunk = 'IHDR') => bytes(PNG_SIG, u32be(13), ascii(chunk), u32be(w), u32be(h), [8, 6, 0, 0, 0])

const riff = (fourcc: string, payload: number[]) => bytes(ascii('RIFF'), u32le(4 + payload.length), ascii('WEBP'), ascii(fourcc), u32le(payload.length), payload)
const vp8 = (w: number, h: number) => riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(w), ...u16le(h), 0, 0])
const vp8l = (w: number, h: number) => riff('VP8L', [0x2f, ...u32le(((h - 1) << 14) | (w - 1)), 0, 0])
const vp8x = (w: number, h: number) => riff('VP8X', [0, 0, 0, 0, ...u24le(w - 1), ...u24le(h - 1)])

describe('readPngSize', () => {
  it('reads big-endian width and height', () => expect(readPngSize(png(70000, 1000))).toEqual({ width: 70000, height: 1000 }))
  it('reads a small picture', () => expect(readPngSize(png(3, 2))).toEqual({ width: 3, height: 2 }))
  it('a wrong signature gives null', () => {
    const b = png(10, 10)
    b[1] = 0x51
    expect(readPngSize(b)).toBeNull()
  })
  it('a first chunk other than IHDR gives null', () => expect(readPngSize(png(10, 10, 'IDAT'))).toBeNull())
  it('width or height 0 gives null', () => {
    expect(readPngSize(png(0, 10))).toBeNull()
    expect(readPngSize(png(10, 0))).toBeNull()
  })
  it('a buffer cut one byte short gives null; every shorter cut too', () => {
    const b = png(640, 480)
    const needed = 24
    expect(readPngSize(b.subarray(0, needed))).toEqual({ width: 640, height: 480 })
    for (let n = 0; n < needed; n++) expect(readPngSize(b.subarray(0, n))).toBeNull()
  })
})

describe('readWebpSize', () => {
  it('VP8 (lossy): 14-bit fields, scale bits masked off', () => {
    expect(readWebpSize(vp8(640, 480))).toEqual({ width: 640, height: 480 })
    expect(readWebpSize(vp8(16383, 16383))).toEqual({ width: 16383, height: 16383 })
    expect(readWebpSize(vp8(0xc000 | 100, 0x4000 | 50))).toEqual({ width: 100, height: 50 })
  })
  it('VP8 with a wrong start code gives null', () => {
    const b = vp8(640, 480)
    b[23] = 0x00
    expect(readWebpSize(b)).toBeNull()
  })
  it('VP8L (lossless): the +1 on both sides, up to 16384', () => {
    expect(readWebpSize(vp8l(640, 480))).toEqual({ width: 640, height: 480 })
    expect(readWebpSize(vp8l(1, 1))).toEqual({ width: 1, height: 1 })
    expect(readWebpSize(vp8l(16384, 16384))).toEqual({ width: 16384, height: 16384 })
  })
  it('VP8L without the 0x2F signature gives null', () => {
    const b = vp8l(640, 480)
    b[20] = 0x2e
    expect(readWebpSize(b)).toBeNull()
  })
  it('VP8X (extended): 24-bit fields + 1', () => {
    expect(readWebpSize(vp8x(10000, 6000))).toEqual({ width: 10000, height: 6000 })
    expect(readWebpSize(vp8x(20000, 20000))).toEqual({ width: 20000, height: 20000 })
  })
  it('RIFF that is not WEBP gives null', () => {
    const b = vp8(10, 10)
    b.set(ascii('WAVE'), 8)
    expect(readWebpSize(b)).toBeNull()
  })
  it('not RIFF, or an unknown first chunk, gives null', () => {
    const b = vp8(10, 10)
    b.set(ascii('RIFX'), 0)
    expect(readWebpSize(b)).toBeNull()
    expect(readWebpSize(riff('ICCP', new Array(20).fill(0)))).toBeNull()
  })
  it('every shorter cut of each form gives null', () => {
    for (const [b, needed] of [
      [vp8(640, 480), 30],
      [vp8l(640, 480), 25],
      [vp8x(640, 480), 30],
    ] as const) {
      expect(readWebpSize(b.subarray(0, needed))).not.toBeNull()
      for (let n = 0; n < needed; n++) expect(readWebpSize(b.subarray(0, n))).toBeNull()
    }
  })
})

describe('readHeaderSize', () => {
  it('dispatches JPEG by its magic bytes (SOF size, not oriented)', () => {
    expect(readHeaderSize(jpeg(app1Exif({ value: 6 }), sof(0xc0, 4000, 3000)))).toEqual({ format: 'jpeg', width: 4000, height: 3000 })
  })
  it('dispatches PNG', () => expect(readHeaderSize(png(70000, 1000))).toEqual({ format: 'png', width: 70000, height: 1000 }))
  it('dispatches WebP (all three forms)', () => {
    expect(readHeaderSize(vp8(640, 480))).toEqual({ format: 'webp', width: 640, height: 480 })
    expect(readHeaderSize(vp8l(640, 480))).toEqual({ format: 'webp', width: 640, height: 480 })
    expect(readHeaderSize(vp8x(10000, 6000))).toEqual({ format: 'webp', width: 10000, height: 6000 })
  })
  it('gives null for a JPEG without a readable SOF', () => expect(readHeaderSize(jpeg(app1Exif({ value: 6 })))).toBeNull())
  it('gives null for HEIC and GIF', () => {
    const heic = bytes([0, 0, 0, 0x18], ascii('ftypheic'), [0, 0, 0, 0], ascii('mif1heic'))
    const gif = bytes(ascii('GIF89a'), [10, 0, 10, 0, 0, 0, 0])
    expect(readHeaderSize(heic)).toBeNull()
    expect(readHeaderSize(gif)).toBeNull()
  })
  it('gives null for empty, one-byte and truncated input without throwing', () => {
    expect(readHeaderSize(new Uint8Array(0))).toBeNull()
    expect(readHeaderSize(bytes([0xff]))).toBeNull()
    expect(readHeaderSize(png(10, 10).subarray(0, 23))).toBeNull()
    expect(readHeaderSize(vp8(10, 10).subarray(0, 27))).toBeNull()
    expect(readHeaderSize(jpeg(sof(0xc0, 10, 10)).subarray(0, 8))).toBeNull()
  })
})

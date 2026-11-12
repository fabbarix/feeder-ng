import { describe, expect, it } from 'vitest'
import { app1Exif, ascii, bytes, jpeg, sof, u16be } from './bytes.test-helper'
import { needsManualOrientation, orientationOps, orientedSize, readJpegInfo, type Orientation } from './exif'

const ALL: Orientation[] = [1, 2, 3, 4, 5, 6, 7, 8]

describe('readJpegInfo orientation', () => {
  for (const little of [false, true]) {
    for (const o of ALL) {
      it(`reads ${o} from ${little ? 'little' : 'big'}-endian EXIF`, () => {
        expect(readJpegInfo(jpeg(app1Exif({ little, value: o }), sof(0xc0, 640, 480))).orientation).toBe(o)
      })
    }
  }

  it('finds the orientation when another IFD0 entry comes first', () => {
    expect(readJpegInfo(jpeg(app1Exif({ value: 6, otherEntryFirst: true }))).orientation).toBe(6)
  })
  it('no APP1 gives 1', () => expect(readJpegInfo(jpeg(sof(0xc0, 10, 10))).orientation).toBe(1))
  it('an APP1 that is not Exif (XMP) gives 1', () => {
    expect(readJpegInfo(jpeg(app1Exif({ value: 6, magic: 'http://ns.adobe.com/xap/1.0/\0' }))).orientation).toBe(1)
  })
  it('an IFD0 without entries gives 1', () => expect(readJpegInfo(jpeg(app1Exif({ noEntries: true }))).orientation).toBe(1))
  it('a different tag gives 1', () => expect(readJpegInfo(jpeg(app1Exif({ value: 6, tag: 0x0111 }))).orientation).toBe(1))
  it('a wrong field type (LONG) gives 1', () => expect(readJpegInfo(jpeg(app1Exif({ value: 6, type: 4 }))).orientation).toBe(1))
  it('value 0 and 9 give 1', () => {
    expect(readJpegInfo(jpeg(app1Exif({ value: 0 }))).orientation).toBe(1)
    expect(readJpegInfo(jpeg(app1Exif({ value: 9 }))).orientation).toBe(1)
  })
  it('an IFD count past the end gives 1', () => {
    expect(readJpegInfo(jpeg(app1Exif({ value: 6, count: 500 }))).orientation).toBe(1)
    expect(readJpegInfo(jpeg(app1Exif({ value: 6, little: true, count: 0xffff }))).orientation).toBe(1)
  })
  it('a bad TIFF byte order mark gives 1', () => {
    const b = jpeg(app1Exif({ value: 6 }))
    b[10] = 0x58 // 'M' -> 'X'
    expect(readJpegInfo(b).orientation).toBe(1)
  })
  it('never throws on any truncation of a valid file', () => {
    const full = jpeg(app1Exif({ value: 6 }), sof(0xc0, 640, 480))
    for (let n = 0; n < full.length; n++) {
      const info = readJpegInfo(full.subarray(0, n))
      expect([1, 6]).toContain(info.orientation)
    }
  })
  it('a truncated APP1 gives 1 and no size', () => {
    const full = jpeg(app1Exif({ value: 6 }), sof(0xc0, 640, 480))
    expect(readJpegInfo(full.subarray(0, 20))).toEqual({ orientation: 1 })
  })
  it('empty, tiny and not-a-JPEG input gives {orientation: 1}', () => {
    expect(readJpegInfo(new Uint8Array(0))).toEqual({ orientation: 1 })
    expect(readJpegInfo(bytes([0xff]))).toEqual({ orientation: 1 })
    expect(readJpegInfo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ orientation: 1 })
    expect(readJpegInfo(new Uint8Array(200).fill(0x41))).toEqual({ orientation: 1 })
  })
  it('ignores an EXIF that lies past the first 128 KB', () => {
    const filler = [0xff, 0xe0, ...u16be(0xffff - 0), ...new Array(0xffff - 2).fill(0)]
    const b = jpeg(filler, filler, filler, app1Exif({ value: 6 }))
    expect(b.length).toBeGreaterThan(131072)
    expect(readJpegInfo(b).orientation).toBe(1)
  })
})

describe('readJpegInfo size', () => {
  it('reads SOF0', () => expect(readJpegInfo(jpeg(sof(0xc0, 640, 480)))).toEqual({ orientation: 1, width: 640, height: 480 }))
  it('reads SOF2 (progressive)', () => expect(readJpegInfo(jpeg(sof(0xc2, 4032, 3024)))).toMatchObject({ width: 4032, height: 3024 }))
  it('reads every SOF marker except C4, C8 and CC', () => {
    for (const m of [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
      expect(readJpegInfo(jpeg(sof(m, 123, 45)))).toMatchObject({ width: 123, height: 45 })
    }
  })
  it('does not take DHT (C4), JPG (C8) or DAC (CC) for a SOF', () => {
    for (const m of [0xc4, 0xc8, 0xcc]) {
      expect(readJpegInfo(jpeg(sof(m, 123, 45)))).toEqual({ orientation: 1 })
    }
  })
  it('finds the SOF after APP1 and APP2', () => {
    const app2 = [0xff, 0xe2, ...u16be(10), ...ascii('ICC_PROF')]
    expect(readJpegInfo(jpeg(app1Exif({ value: 8 }), app2, sof(0xc0, 800, 600)))).toEqual({ orientation: 8, width: 800, height: 600 })
  })
  it('gives the stored size, not the oriented one', () => {
    expect(readJpegInfo(jpeg(app1Exif({ value: 6 }), sof(0xc0, 4000, 3000)))).toMatchObject({ width: 4000, height: 3000 })
  })
  it('a SOF cut short gives no size', () => {
    const full = jpeg(sof(0xc0, 640, 480))
    for (let n = 2; n < 2 + 9; n++) expect(readJpegInfo(full.subarray(0, n))).toEqual({ orientation: 1 })
  })
  it('a segment with a length past the end stops the scan without throwing', () => {
    expect(readJpegInfo(bytes([0xff, 0xd8], [0xff, 0xe0, 0xff, 0xff, 1, 2, 3]))).toEqual({ orientation: 1 })
  })
  it('a SOF with width or height 0 gives no size', () => {
    const info = readJpegInfo(jpeg(sof(0xc0, 0, 480)))
    expect(info.width).toBeUndefined()
    expect(info.height).toBeUndefined()
  })
})

describe('orientationOps', () => {
  const table: Record<Orientation, { turns: number; mirror: boolean }> = {
    1: { turns: 0, mirror: false },
    2: { turns: 0, mirror: true },
    3: { turns: 2, mirror: false },
    4: { turns: 2, mirror: true },
    5: { turns: 1, mirror: true },
    6: { turns: 1, mirror: false },
    7: { turns: 3, mirror: true },
    8: { turns: 3, mirror: false },
  }
  for (const o of ALL) it(`row ${o}`, () => expect(orientationOps(o)).toEqual(table[o]))

  // Stored 3 x 2 grid, row-major; `turns` clockwise quarter turns then a horizontal mirror.
  type Grid = string[][]
  const turnCw = (g: Grid): Grid => Array.from({ length: g[0]!.length }, (_, x) => g.map((row) => row[x]!).reverse())
  const mirrorH = (g: Grid): Grid => g.map((row) => [...row].reverse())
  const apply = (g: Grid, o: Orientation): Grid => {
    const { turns, mirror } = orientationOps(o)
    let out = g
    for (let i = 0; i < turns; i++) out = turnCw(out)
    return mirror ? mirrorH(out) : out
  }
  // The upright picture, and the stored pixels the camera writes for each orientation (the inverse of the op).
  const upright: Grid = [
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
  ]
  const stored: Record<Orientation, Grid> = {
    1: upright,
    2: [
      ['C', 'B', 'A'],
      ['F', 'E', 'D'],
    ],
    3: [
      ['F', 'E', 'D'],
      ['C', 'B', 'A'],
    ],
    4: [
      ['D', 'E', 'F'],
      ['A', 'B', 'C'],
    ],
    5: [
      ['A', 'D'],
      ['B', 'E'],
      ['C', 'F'],
    ],
    6: [
      ['D', 'A'],
      ['E', 'B'],
      ['F', 'C'],
    ],
    7: [
      ['F', 'C'],
      ['E', 'B'],
      ['D', 'A'],
    ],
    8: [
      ['C', 'F'],
      ['B', 'E'],
      ['A', 'D'],
    ],
  }
  for (const o of ALL) it(`applying the ops of ${o} to its stored grid gives the upright grid`, () => expect(apply(stored[o], o)).toEqual(upright))
})

describe('orientedSize', () => {
  it('keeps the size for 1..4', () => {
    for (const o of [1, 2, 3, 4] as Orientation[]) expect(orientedSize(4000, 3000, o)).toEqual({ width: 4000, height: 3000 })
  })
  it('swaps the sides for 5..8', () => {
    for (const o of [5, 6, 7, 8] as Orientation[]) expect(orientedSize(4000, 3000, o)).toEqual({ width: 3000, height: 4000 })
  })
})

describe('needsManualOrientation', () => {
  it('is true only when the browser does not apply EXIF and o is not 1', () => {
    for (const o of ALL) {
      expect(needsManualOrientation(false, o)).toBe(o !== 1)
      expect(needsManualOrientation(true, o)).toBe(false)
    }
  })
})

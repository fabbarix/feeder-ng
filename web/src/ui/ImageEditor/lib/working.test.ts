import { describe, expect, it } from 'vitest'
import {
  AS_IS_MAX_BYTES,
  INPUT_MAX_BYTES,
  INPUT_MAX_PIXELS,
  KEEP_MAX_BYTES,
  READ_MAX_SIDE,
  WORK_MAX_AREA,
  WORK_MAX_SIDE,
  keepOriginal,
  workingSize,
} from './working'

const MB = 1024 * 1024

describe('constants (section 3.5)', () => {
  it('have the designed values', () => {
    expect(WORK_MAX_SIDE).toBe(4096)
    expect(WORK_MAX_AREA).toBe(16_777_216)
    expect(READ_MAX_SIDE).toBe(2576)
    expect(INPUT_MAX_BYTES).toBe(30 * MB)
    expect(INPUT_MAX_PIXELS).toBe(50_000_000)
    expect(KEEP_MAX_BYTES).toBe(8 * MB)
    expect(AS_IS_MAX_BYTES).toBe(8 * MB)
  })
  it('a full working side squared is exactly the iOS canvas limit', () => expect(WORK_MAX_SIDE * WORK_MAX_SIDE).toBe(WORK_MAX_AREA))
})

describe('workingSize', () => {
  it('never enlarges', () => expect(workingSize(800, 600)).toEqual({ width: 800, height: 600 }))
  it('a size on the cap is unchanged', () => {
    expect(workingSize(4096, 4096)).toEqual({ width: 4096, height: 4096 })
    expect(workingSize(4096, 100)).toEqual({ width: 4096, height: 100 })
  })
  it('caps the long side at 4096, keeping the aspect', () => {
    expect(workingSize(8064, 6048)).toEqual({ width: 4096, height: 3072 })
    expect(workingSize(6048, 8064)).toEqual({ width: 3072, height: 4096 })
  })
  it('5000 x 4000 is within both caps', () => {
    const s = workingSize(5000, 4000)
    expect(s).toEqual({ width: 4096, height: 3277 })
    expect(s.width * s.height).toBeLessThanOrEqual(WORK_MAX_AREA)
  })
  it('a very wide strip keeps one pixel on the short side', () => expect(workingSize(40000, 1)).toEqual({ width: 4096, height: 1 }))
  it('never exceeds either cap over a sweep of sizes', () => {
    for (const [w, h] of [[4097, 4097], [4096, 4095], [9000, 9000], [12000, 3], [50000, 1000], [4100, 4090], [1, 1]] as [number, number][]) {
      const s = workingSize(w, h)
      expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(WORK_MAX_SIDE)
      expect(s.width * s.height).toBeLessThanOrEqual(WORK_MAX_AREA)
      expect(s.width).toBeGreaterThanOrEqual(1)
      expect(s.height).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('keepOriginal', () => {
  const ok = { type: 'image/jpeg', orientation: 1 as const, width: 4000, height: 3000, bytes: 3 * MB }
  it('keeps an upright JPEG that fits', () => expect(keepOriginal(ok)).toBe(true))
  it('keeps one exactly at 8 MB and exactly on the size cap', () => {
    expect(keepOriginal({ ...ok, bytes: KEEP_MAX_BYTES })).toBe(true)
    expect(keepOriginal({ ...ok, width: 4096, height: 3072 })).toBe(true)
  })
  it('does not keep one byte over 8 MB', () => expect(keepOriginal({ ...ok, bytes: KEEP_MAX_BYTES + 1 })).toBe(false))
  it('does not keep any orientation other than 1', () => {
    for (const o of [2, 3, 4, 5, 6, 7, 8] as const) expect(keepOriginal({ ...ok, orientation: o })).toBe(false)
  })
  it('does not keep a picture that workingSize would shrink', () => {
    expect(keepOriginal({ ...ok, width: 5000, height: 4000 })).toBe(false)
    expect(keepOriginal({ ...ok, width: 4097, height: 100 })).toBe(false)
  })
  it('does not keep a PNG, a WebP, a HEIC or an empty type', () => {
    for (const type of ['image/png', 'image/webp', 'image/heic', '']) expect(keepOriginal({ ...ok, type })).toBe(false)
  })
})

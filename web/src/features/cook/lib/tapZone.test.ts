// B9-40 (SHORT-01, decision SHORT 3): a tap goes Back or Next, a scroll of a long Step does not. isTap is the threshold.
import { describe, expect, it } from 'vitest'
import { isTap, TAP_SLOP_PX } from './tapZone'

describe('isTap', () => {
  it('the threshold is 10 px', () => {
    expect(TAP_SLOP_PX).toBe(10)
  })
  it('a press that stays put, or moves a few pixels, is a tap', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true)
    expect(isTap({ x: 100, y: 100 }, { x: 109, y: 100 })).toBe(true)
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 104 })).toBe(true)
  })
  it('a move of 10 px or more is not a tap, in either direction', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 110, y: 100 })).toBe(false)
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 90 })).toBe(false)
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 160 })).toBe(false)
    expect(isTap({ x: 100, y: 100 }, { x: 30, y: 100 })).toBe(false)
  })
  it('the distance is straight-line: 7 px right and 7 px down (9.9 px) is still a tap, 8 and 8 (11.3 px) is not', () => {
    expect(isTap({ x: 0, y: 0 }, { x: 7, y: 7 })).toBe(true)
    expect(isTap({ x: 0, y: 0 }, { x: 8, y: 8 })).toBe(false)
  })
})

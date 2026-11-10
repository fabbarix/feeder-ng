import { describe, expect, it } from 'vitest'
import { hexToHue, hueToHex, isHex, normaliseHex } from './color'

describe('hex helpers', () => {
  it('validates #RGB and #RRGGBB only', () => {
    expect(isHex('#2a7f62')).toBe(true)
    expect(isHex('#2A7')).toBe(true)
    expect(isHex('2a7f62')).toBe(false)
    expect(isHex('#2a7f6')).toBe(false)
    expect(isHex('#gggggg')).toBe(false)
  })
  it('normalises to lower-case #rrggbb', () => {
    expect(normaliseHex('#2A7F62')).toBe('#2a7f62')
    expect(normaliseHex('#2a7')).toBe('#22aa77')
    expect(normaliseHex('nope')).toBeNull()
  })
  it('hue round-trips approximately and always yields a valid hex', () => {
    for (const hue of [0, 60, 120, 180, 240, 300, 359]) {
      const hex = hueToHex(hue)
      expect(isHex(hex)).toBe(true)
      expect(Math.abs(hexToHue(hex) - hue)).toBeLessThan(2)
    }
  })
})

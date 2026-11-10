import { describe, expect, it } from 'vitest'
import { hexToOklch, oklchToHex } from './color'

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

describe('hexToOklch (reference values from the CSS Color 4 / Ottosson matrices)', () => {
  it('black, white and greys are achromatic', () => {
    const black = hexToOklch('#000000')
    expect(black.l).toBeCloseTo(0, 4)
    expect(black.c).toBeCloseTo(0, 4)
    const white = hexToOklch('#ffffff')
    expect(white.l).toBeCloseTo(1, 3)
    expect(white.c).toBeLessThan(0.001)
    expect(white.h).toBe(0)
    const grey = hexToOklch('#808080')
    expect(grey.l).toBeCloseTo(0.5999, 3)
    expect(grey.c).toBeLessThan(0.001)
  })

  it.each([
    ['#ff0000', 0.628, 0.2577, 29.23],
    ['#00ff00', 0.8664, 0.2948, 142.5],
    ['#0000ff', 0.452, 0.3132, 264.05],
  ])('primary %s is oklch(%d %d %d)', (hex, l, c, h) => {
    const o = hexToOklch(hex)
    expect(o.l).toBeCloseTo(l, 2)
    expect(o.c).toBeCloseTo(c, 2)
    expect(o.h).toBeCloseTo(h, 0)
  })

  it('Basil #3f7d58 is oklch(.5375 .0874 155.7)', () => {
    const o = hexToOklch('#3f7d58')
    expect(o.l).toBeCloseTo(0.5375, 3)
    expect(o.c).toBeCloseTo(0.0874, 3)
    expect(o.h).toBeCloseTo(155.73, 1)
  })

  it('accepts #rgb and upper case', () => {
    expect(hexToOklch('#F00')).toEqual(hexToOklch('#ff0000'))
  })

  it('throws on invalid hex', () => {
    expect(() => hexToOklch('green')).toThrow(/hex/i)
  })
})

describe('oklchToHex', () => {
  it('maps the neutral axis', () => {
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe('#000000')
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff')
  })

  it('reproduces the plan tones for Basil (hue 155.73)', () => {
    // plan 3.1 table, Basil light column
    expect(oklchToHex({ l: 0.955, c: 0.018, h: 155.73 })).toBe('#e7f4eb')
    expect(oklchToHex({ l: 0.995, c: 0.006, h: 155.73 })).toBe('#fafffc')
    expect(oklchToHex({ l: 0.5, c: 0.0874, h: 155.73 })).toBe('#34724e')
  })

  it('wraps hue: 360 + h equals h, negative hue works', () => {
    expect(oklchToHex({ l: 0.6, c: 0.1, h: 400 })).toBe(oklchToHex({ l: 0.6, c: 0.1, h: 40 }))
    expect(oklchToHex({ l: 0.6, c: 0.1, h: -20 })).toBe(oklchToHex({ l: 0.6, c: 0.1, h: 340 }))
  })

  it('out-of-gamut colours keep lightness and hue and lose chroma', () => {
    const wild = oklchToHex({ l: 0.9, c: 0.35, h: 142 }) // far outside sRGB
    expect(wild).toMatch(/^#[0-9a-f]{6}$/)
    const back = hexToOklch(wild)
    expect(back.l).toBeCloseTo(0.9, 1)
    expect(back.c).toBeLessThan(0.35)
    expect(Math.abs(back.h - 142)).toBeLessThan(6)
  })

  it('never returns an out-of-range channel for extreme input', () => {
    for (const l of [0, 0.02, 0.5, 0.98, 1]) {
      for (const h of [0, 90, 180, 270]) {
        for (const c of channels(oklchToHex({ l, c: 0.4, h }))) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(255)
        }
      }
    }
  })
})

describe('OKLCH round trip', () => {
  const samples = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#3f7d58', '#c0392b', '#b7791f',
    '#3b5bdb', '#7b3f8c', '#0f766e', '#475569', '#e7f4eb', '#090f0b', '#fee1cf', '#123456', '#fedcba']
  it.each(samples)('hex -> oklch -> hex is the identity for %s (within 1 per channel)', (hex) => {
    const back = channels(oklchToHex(hexToOklch(hex)))
    const orig = channels(hex)
    for (let i = 0; i < 3; i++) expect(Math.abs(back[i]! - orig[i]!)).toBeLessThanOrEqual(1)
  })

  it('is exact over a coarse sRGB grid', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
          expect(oklchToHex(hexToOklch(hex)), hex).toBe(hex)
        }
      }
    }
  })
})

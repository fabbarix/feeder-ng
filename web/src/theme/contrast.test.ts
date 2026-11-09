import { describe, expect, it } from 'vitest'
import { contrastRatio, ensureContrast, meetsAA, normalizeHex } from './contrast'

describe('normalizeHex', () => {
  it('lower-cases and expands shorthand', () => {
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef')
    expect(normalizeHex('#fa0')).toBe('#ffaa00')
  })
  it.each(['', 'red', '#12', '#12345', '#gggggg', 'ffffff'])('rejects %j', (bad) => {
    expect(() => normalizeHex(bad)).toThrow(/hex/i)
  })
})

describe('contrastRatio (WCAG 2.x)', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })
  it('is symmetric and 1:1 for identical colours', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5)
    expect(contrastRatio('#336699', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#336699'), 10)
  })
  it('matches a known reference value (#767676 on white is 4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })
})

describe('meetsAA', () => {
  it('uses 4.5 for normal text and 3 for large text', () => {
    expect(meetsAA('#767676', '#ffffff')).toBe(true)
    expect(meetsAA('#777777', '#ffffff')).toBe(false) // 4.48
    expect(meetsAA('#777777', '#ffffff', { large: true })).toBe(true)
    expect(meetsAA('#999999', '#ffffff', { large: true })).toBe(false) // 2.85
  })
})

describe('ensureContrast', () => {
  it('returns a passing colour unchanged', () => {
    expect(ensureContrast('#000000', '#ffffff')).toBe('#000000')
  })

  it.each([
    ['#777777', '#808080'],
    ['#ffff00', '#ffffff'],
    ['#123456', '#0a0a0a'],
    ['#cccccc', '#eeeeee'],
    ['#ff0000', '#ff0001'],
  ])('lifts %s on %s to at least 4.5:1', (fg, bg) => {
    const out = ensureContrast(fg, bg)
    expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('honours a custom minimum', () => {
    expect(contrastRatio(ensureContrast('#888888', '#ffffff', 7), '#ffffff')).toBeGreaterThanOrEqual(7)
  })

  it('keeps the hue family when it can (a blue stays blue-dominant)', () => {
    const out = ensureContrast('#6b8cff', '#ffffff')
    const n = parseInt(out.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThanOrEqual(g)
  })
})

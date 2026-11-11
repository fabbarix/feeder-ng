// The Tag palette (TG-UI): ids, names, the OKLCH numbers and the contrast the spec promises (spec 4.1, tg-plan 3.3 and 4.3).
import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, oklchToHex } from '../../theme/color'
import { readStylesCss } from '../../ui/test-utils'
import { REFERENCE_PALETTE } from './palette.fixture'
import { isTagColour, TAG_COLOURS, TAG_PALETTE, tagColourName, tagToken } from './palette'

const IDS = REFERENCE_PALETTE.map((r) => r.id)
const SCHEMES = ['light', 'dark'] as const
const PARTS = ['bg', 'fg', 'dot'] as const

/** The default --color-surface of a scheme, read from styles.css. */
function surface(scheme: 'light' | 'dark'): string {
  const css = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')
  const start = css.indexOf(scheme === 'light' ? "[data-scheme='light'] {" : "[data-scheme='dark'] {")
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return /--color-surface:\s*(#[0-9a-f]{6})/i.exec(body)![1]!
}

describe('the reference table itself (guards the spec numbers)', () => {
  it.each(IDS)('%s: text 7:1 on the fill, dot 3:1 on the fill and on the surface, both schemes', (id) => {
    const ref = REFERENCE_PALETTE.find((r) => r.id === id)!
    for (const scheme of SCHEMES) {
      const hex = (p: (typeof PARTS)[number]) => oklchToHex({ l: ref[scheme][p][0], c: ref[scheme][p][1], h: ref.hue })
      expect(contrastRatio(hex('fg'), hex('bg')), `${id} ${scheme} fg/bg`).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(hex('dot'), hex('bg')), `${id} ${scheme} dot/bg`).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(hex('dot'), surface(scheme)), `${id} ${scheme} dot/surface`).toBeGreaterThanOrEqual(3)
    }
  })
  it.each(IDS)('%s: each listed hex is the gamut-fitted sRGB of its triple (within 2 per channel)', (id) => {
    const ref = REFERENCE_PALETTE.find((r) => r.id === id)!
    for (const scheme of SCHEMES) {
      for (const p of PARTS) {
        const [l, c, hex] = ref[scheme][p]
        const got = hexToRgb(oklchToHex({ l, c, h: ref.hue }))
        const want = hexToRgb(hex)
        got.forEach((v, i) => expect(Math.abs(v - want[i]!), `${id} ${scheme} ${p}`).toBeLessThanOrEqual(2))
      }
    }
  })
})

describe('palette ids and names', () => {
  it('TAG_COLOURS is the ten ids in order', () => {
    expect(TAG_COLOURS).toEqual(['tomato', 'apricot', 'mustard', 'olive', 'sage', 'teal', 'sky', 'blue', 'plum', 'rose'])
  })
  it('TAG_PALETTE follows the same order, with display names', () => {
    expect(TAG_PALETTE.map((c) => c.id)).toEqual(IDS)
    expect(TAG_PALETTE.map((c) => c.name)).toEqual(REFERENCE_PALETTE.map((r) => r.name))
  })
  it('isTagColour accepts the ten ids only', () => {
    for (const id of IDS) expect(isTagColour(id)).toBe(true)
    for (const bad of ['', 'Sage', 'red', 'tomato ', undefined, null, 4]) expect(isTagColour(bad)).toBe(false)
  })
  it('tagColourName gives the display name, undefined for an unknown id', () => {
    expect(tagColourName('sage')).toBe('Sage')
    expect(tagColourName('rose')).toBe('Rose')
    expect(tagColourName('red')).toBeUndefined()
  })
  it('tagToken names the custom property', () => {
    expect(tagToken('sage', 'bg')).toBe('--tag-sage-bg')
    expect(tagToken('plum', 'dot')).toBe('--tag-plum-dot')
  })
})

describe('palette numbers match the reference table', () => {
  it.each(IDS)('%s: every L, C and hue', (id) => {
    const ref = REFERENCE_PALETTE.find((r) => r.id === id)!
    const got = TAG_PALETTE.find((c) => c.id === id)
    expect(got, `${id} in TAG_PALETTE`).toBeDefined()
    for (const scheme of SCHEMES) {
      for (const p of PARTS) {
        const [l, c] = ref[scheme][p]
        expect(got![scheme][p].l).toBeCloseTo(l, 4)
        expect(got![scheme][p].c).toBeCloseTo(c, 4)
        expect(got![scheme][p].h).toBeCloseTo(ref.hue, 4)
      }
    }
  })
})

describe('contrast computed from palette.ts (spec 4.1: text 7:1, dot 3:1)', () => {
  it('has a palette to check', () => expect(TAG_PALETTE).toHaveLength(10))
  it.each(IDS)('%s: fg on bg at least 7:1 and dot on bg at least 3:1, light and dark', (id) => {
    const colour = TAG_PALETTE.find((c) => c.id === id)
    expect(colour, `${id} in TAG_PALETTE`).toBeDefined()
    for (const scheme of SCHEMES) {
      const s = colour![scheme]
      const bg = oklchToHex(s.bg)
      expect(contrastRatio(oklchToHex(s.fg), bg), `${id} ${scheme} fg/bg`).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(oklchToHex(s.dot), bg), `${id} ${scheme} dot/bg`).toBeGreaterThanOrEqual(3)
    }
  })
  it.each(IDS)('%s: dot on the default --color-surface of each scheme at least 3:1 (the unselected filter chip)', (id) => {
    const colour = TAG_PALETTE.find((c) => c.id === id)
    expect(colour, `${id} in TAG_PALETTE`).toBeDefined()
    for (const scheme of SCHEMES) {
      expect(contrastRatio(oklchToHex(colour![scheme].dot), surface(scheme)), `${id} ${scheme}`).toBeGreaterThanOrEqual(3)
    }
  })
  it('no two colours share a dot in the same scheme', () => {
    for (const scheme of SCHEMES) {
      const hexes = TAG_PALETTE.map((c) => oklchToHex(c[scheme].dot))
      expect(new Set(hexes).size).toBe(hexes.length)
      expect(hexes).toHaveLength(10)
    }
  })
})

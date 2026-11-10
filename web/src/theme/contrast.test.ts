import { describe, expect, it } from 'vitest'
import { contrastRatio, ensureContrast, meetsAA, normalizeHex } from './contrast'
import { generatePalette, type Scheme } from './palette'
import { ACCENT_PRESETS } from '../features/settings/lib/accents'

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

// ---------------------------------------------------------------------------
// Bento colour contract (docs/design/ui-fix-plan.md section 3.1), WP0 guard.
//
// The plan's pair table, asserted for all 7 accent presets x light/dark.
// These cannot pass until WP1 (tokens) rewrites generatePalette to the new
// token set, so they are gated on `hasBentoTokens`: while the palette still has
// the old Material-style keys the whole block is skipped (reported as skipped,
// never red). TODO(WP1): once generatePalette emits the keys below the gate
// opens by itself and these become live. If WP1 names the keys differently,
// edit TOKEN_KEYS here (one line) rather than weakening the pairs. If only some keys
// exist the block still runs, so the missing ones fail loudly instead of staying skipped.
// ---------------------------------------------------------------------------

/** Palette keys, camelCase of the CSS variables --color-bg, --color-surface-2, ... */
const TOKEN_KEYS = [
  'bg', 'surface', 'surface2', 'surface3', 'line', 'outline', 'text', 'muted',
  'accent', 'onAccent', 'accentText', 'soft', 'softStrong',
] as const
type BentoKey = (typeof TOKEN_KEYS)[number]

/** [foreground, background, minimum ratio, what it is]. Text >= 4.5, control boundaries >= 3. */
const BENTO_PAIRS: ReadonlyArray<readonly [BentoKey, BentoKey, number, string]> = [
  ['text', 'bg', 4.5, 'text / bg'],
  ['text', 'surface', 4.5, 'text / surface'],
  ['muted', 'surface2', 4.5, 'muted / surface-2'],
  ['onAccent', 'accent', 4.5, 'on-accent / accent'],
  ['accentText', 'soft', 4.5, 'accent-text / soft'],
  ['accentText', 'softStrong', 4.5, 'accent-text / soft-strong'],
  ['accent', 'surface', 3, 'accent / surface (button boundary)'],
  ['outline', 'surface', 3, 'outline / surface (field boundary)'],
]

const colourMap = (accent: string, scheme: Scheme) =>
  generatePalette({ accent }, scheme).colors as unknown as Record<string, string>

const presentKeys = TOKEN_KEYS.filter((k) => k in colourMap('#3f7d58', 'light'))
// The old palette already has `surface` and `outline`, so "any key present" is not a signal.
// These keys exist only in the Bento set: while none of them exist the old palette is in place
// and the contract is skipped. Once any appears, every key must (below) or this goes red, so a
// half-done WP1 can never leave the contract skipped for good.
const BENTO_ONLY_KEYS: readonly BentoKey[] = ['surface2', 'surface3', 'onAccent', 'accentText', 'soft', 'softStrong']
const hasBentoTokens = BENTO_ONLY_KEYS.some((k) => presentKeys.includes(k))

it.skipIf(!hasBentoTokens || presentKeys.length === TOKEN_KEYS.length)(
  'Bento palette exposes every token key (all or none)',
  () => {
    const missing = TOKEN_KEYS.filter((k) => !presentKeys.includes(k))
    expect(missing, `generatePalette lacks Bento keys: ${missing.join(', ')}`).toEqual([])
  },
)

describe.skipIf(!hasBentoTokens)('Bento palette contract (TODO(WP1): enabled when tokens land)', () => {
  const cases = ACCENT_PRESETS.flatMap((p) =>
    (['light', 'dark'] as const).flatMap((scheme) =>
      BENTO_PAIRS.map(([fg, bg, min, label]) => [p.name, scheme, label, fg, bg, min] as const),
    ),
  )
  it.each(cases)('%s %s: %s', (preset, scheme, _label, fg, bg, min) => {
    const accent = ACCENT_PRESETS.find((p) => p.name === preset)!.hex
    const c = colourMap(accent, scheme)
    expect(contrastRatio(c[fg]!, c[bg]!)).toBeGreaterThanOrEqual(min)
  })

  it('Basil light and dark match the plan table within 1 per channel', () => {
    const basil = ACCENT_PRESETS.find((p) => p.name === 'Basil')!.hex
    const expected = {
      light: { bg: '#e7f4eb', surface: '#fafffc', surface2: '#daecdf', accent: '#34724e', text: '#131d17' },
      dark: { bg: '#090f0b', surface: '#131c16', surface2: '#1e2a22', accent: '#89c8a0', text: '#e9f1ec' },
    } as const
    for (const scheme of ['light', 'dark'] as const) {
      const c = colourMap(basil, scheme)
      for (const [key, hex] of Object.entries(expected[scheme])) {
        const a = parseInt(c[key]!.slice(1), 16)
        const b = parseInt(hex.slice(1), 16)
        for (const shift of [16, 8, 0]) {
          expect(Math.abs(((a >> shift) & 255) - ((b >> shift) & 255))).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

// The status palette is fixed data (section 3.1), so it is checked today.
// TODO(WP1): read these from the generated tokens (--status-<name>-fg|bg|solid) instead.
const STATUS = {
  leftover: { lightFg: '#065353', lightBg: '#c2f3f2', darkFg: '#85e4e3', darkBg: '#043535', solid: '#027879' },
  spoil: { lightFg: '#6d3706', lightBg: '#fee1cf', darkFg: '#fec39b', darkBg: '#44250c', solid: '#9e5106' },
  danger: { lightFg: '#742e2b', lightBg: '#ffe0dc', darkFg: '#febfb9', darkBg: '#47211e', solid: '#ab413e' },
  success: { lightFg: '#115629', lightBg: '#d1f2d7', darkFg: '#a7e2b2', darkBg: '#14361d', solid: '#0a7e3a' },
  pinned: { lightFg: '#3e3f7c', lightBg: '#e3e6fe', darkFg: '#c7cdff', darkBg: '#282a4b', solid: '#5b5cb7' },
} as const

describe('status palette (plan 3.1)', () => {
  it.each(Object.entries(STATUS))('%s: text on container >= 4.5 in both schemes, white on solid >= 4.5', (_n, s) => {
    expect(contrastRatio(s.lightFg, s.lightBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(s.darkFg, s.darkBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#ffffff', s.solid)).toBeGreaterThanOrEqual(4.5)
  })
})

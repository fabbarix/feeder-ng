import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'
import { hexToOklch } from './color'
import {
  COLOR_ALIASES,
  COLOR_TOKENS,
  STATUS_NAMES,
  STATUS_PALETTE,
  cssVarName,
  generatePalette,
  statusVarName,
  toCssVars,
  type ColorToken,
  type Scheme,
} from './palette'
import { ACCENT_PRESETS } from '../features/settings/lib/accents'
import { GOLDEN_PALETTES } from './palette.golden'

const SCHEMES: Scheme[] = ['light', 'dark']
const PRESETS = ACCENT_PRESETS.map((p) => p.name)
const accentOf = (name: string) => ACCENT_PRESETS.find((p) => p.name === name)!.hex
const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
const withinPerChannel = (a: string, b: string, tol: number) => {
  const ca = channels(a)
  const cb = channels(b)
  return [0, 1, 2].every((i) => Math.abs(ca[i]! - cb[i]!) <= tol)
}

// Plan 3.1 tone table. 'C' = the accent's chroma clamped to 0.04..0.16. A string is a fixed colour.
type Tone = readonly [l: number, c: number | 'C'] | string
const TONES: Record<Scheme, Record<ColorToken, Tone>> = {
  light: {
    bg: [0.955, 0.018], surface: [0.995, 0.006], surface2: [0.925, 0.025], surface3: [0.885, 0.035],
    line: [0.86, 0.03], outline: [0.56, 0.03], text: [0.22, 0.02], muted: [0.45, 0.025],
    accent: [0.5, 'C'], onAccent: '#ffffff', accentText: [0.4, 'C'], soft: [0.9, 0.06], softStrong: [0.84, 0.09],
  },
  dark: {
    bg: [0.16, 0.012], surface: [0.215, 0.018], surface2: [0.27, 0.022], surface3: [0.32, 0.026],
    line: [0.35, 0.025], outline: [0.62, 0.03], text: [0.95, 0.01], muted: [0.78, 0.02],
    accent: [0.78, 'C'], onAccent: [0.2, 0.04], accentText: [0.86, 'C'], soft: [0.32, 0.06], softStrong: [0.38, 0.08],
  },
}

// Plan 3.1 "Basil light / Basil dark" columns, verbatim.
const BASIL = {
  light: { bg: '#e7f4eb', surface: '#fafffc', surface2: '#daecdf', surface3: '#c8e0cf', line: '#c2d7c9', outline: '#677a6d',
    text: '#131d17', muted: '#4b5a4f', accent: '#34724e', onAccent: '#ffffff', accentText: '#135533', soft: '#bfebcd', softStrong: '#9addb2' },
  dark: { bg: '#090f0b', surface: '#131c16', surface2: '#1e2a22', surface3: '#28372d', line: '#303f35', outline: '#788c7f',
    text: '#e9f1ec', muted: '#aebbb2', accent: '#89c8a0', onAccent: '#051b0e', accentText: '#a2e3b9', soft: '#143c25', softStrong: '#144f30' },
} as const

const CASES = PRESETS.flatMap((p) => SCHEMES.map((s) => [p, s] as const))

describe('generatePalette: shape', () => {
  it('returns exactly the 13 Bento colour tokens as #rrggbb, plus status', () => {
    const p = generatePalette({ accent: accentOf('Basil') }, 'light')
    expect(p.scheme).toBe('light')
    expect(Object.keys(p.colors).sort()).toEqual([...COLOR_TOKENS].sort())
    expect(COLOR_TOKENS).toHaveLength(13)
    for (const v of Object.values(p.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
    expect(Object.keys(p.status).sort()).toEqual([...STATUS_NAMES].sort())
  })

  it('is deterministic and accepts #rgb / upper-case input', () => {
    const a = generatePalette({ accent: '#3F7D58' }, 'light')
    expect(generatePalette({ accent: '#3f7d58' }, 'light')).toEqual(a)
    expect(generatePalette({ accent: '#fa0' }, 'dark')).toEqual(generatePalette({ accent: '#ffaa00' }, 'dark'))
  })

  it('throws on an invalid accent', () => {
    expect(() => generatePalette({ accent: 'banana' }, 'light')).toThrow(/hex/i)
  })

  it('ignores the deprecated secondary', () => {
    expect(generatePalette({ accent: '#3f7d58', secondary: '#2e86ab' }, 'light')).toEqual(
      generatePalette({ accent: '#3f7d58' }, 'light'),
    )
  })

  it('a different accent gives a different accent token and tint', () => {
    const a = generatePalette({ accent: accentOf('Basil') }, 'light').colors
    const b = generatePalette({ accent: accentOf('Tomato') }, 'light').colors
    expect(a.accent).not.toBe(b.accent)
    expect(a.bg).not.toBe(b.bg)
  })

  it('survives extreme accents (black, white, grey, saturated) with in-range tokens', () => {
    for (const accent of ['#000000', '#ffffff', '#808080', '#ff00ff', '#00ff00']) {
      for (const scheme of SCHEMES) {
        const p = generatePalette({ accent }, scheme)
        for (const v of Object.values(p.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
        expect(contrastRatio(p.colors.text, p.colors.bg), `${accent} ${scheme}`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(p.colors.onAccent, p.colors.accent), `${accent} ${scheme}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

describe('generatePalette: plan 3.1 tone table, 7 presets x light/dark', () => {
  it.each(CASES)('%s %s: every token sits on its L (and carries the accent hue) from the table', (preset, scheme) => {
    const accent = accentOf(preset)
    const accentO = hexToOklch(accent)
    const C = Math.min(0.16, Math.max(0.04, accentO.c))
    const colors = generatePalette({ accent }, scheme).colors
    for (const token of COLOR_TOKENS) {
      const tone = TONES[scheme][token]
      const got = hexToOklch(colors[token])
      if (typeof tone === 'string') {
        expect(colors[token], token).toBe(tone)
        continue
      }
      const [l, c] = tone
      const wantC = c === 'C' ? C : c
      expect(Math.abs(got.l - l), `${token} lightness`).toBeLessThanOrEqual(0.015)
      // gamut mapping may only lower chroma; 8-bit rounding adds ~0.003
      expect(got.c, `${token} chroma`).toBeLessThanOrEqual(wantC + 0.006)
      if (wantC >= 0.03 && got.c >= 0.02) {
        const d = Math.abs(((got.h - accentO.h + 540) % 360) - 180)
        expect(d, `${token} hue`).toBeLessThanOrEqual(6)
      }
    }
  })

  it.each(CASES)('%s %s: matches the reference palette within 2 per channel', (preset, scheme) => {
    const colors = generatePalette({ accent: accentOf(preset) }, scheme).colors
    const golden = GOLDEN_PALETTES[preset as keyof typeof GOLDEN_PALETTES][scheme]
    for (const token of COLOR_TOKENS) {
      expect(withinPerChannel(colors[token], golden[token], 2), `${token}: ${colors[token]} vs ${golden[token]}`).toBe(true)
    }
  })

  it.each(SCHEMES)('Basil %s: hexes match the plan table within 1 per channel', (scheme) => {
    const colors = generatePalette({ accent: accentOf('Basil') }, scheme).colors
    for (const token of COLOR_TOKENS) {
      expect(withinPerChannel(colors[token], BASIL[scheme][token], 1), `${token}: ${colors[token]} vs ${BASIL[scheme][token]}`).toBe(true)
    }
  })

  it.each(CASES)('%s %s: tonal ladder steps in the right direction', (preset, scheme) => {
    const c = generatePalette({ accent: accentOf(preset) }, scheme).colors
    const L = (t: ColorToken) => hexToOklch(c[t]).l
    if (scheme === 'light') {
      // white-ish cards on a tinted ground, then progressively darker
      expect(L('surface')).toBeGreaterThan(L('bg'))
      expect(L('bg')).toBeGreaterThan(L('surface2'))
      expect(L('surface2')).toBeGreaterThan(L('surface3'))
      expect(L('surface3')).toBeGreaterThan(L('line') - 0.03)
      expect(L('text')).toBeLessThan(L('muted'))
    } else {
      expect(L('surface')).toBeGreaterThan(L('bg'))
      expect(L('surface2')).toBeGreaterThan(L('surface'))
      expect(L('surface3')).toBeGreaterThan(L('surface2'))
      expect(L('text')).toBeGreaterThan(L('muted'))
    }
  })

  it('light: tiles are LIGHTER than the page (root cause 1 of the plan)', () => {
    for (const p of PRESETS) {
      const c = generatePalette({ accent: accentOf(p) }, 'light').colors
      expect(contrastRatio(c.surface, c.bg), p).toBeGreaterThan(1.08)
      expect(hexToOklch(c.surface).l).toBeGreaterThan(hexToOklch(c.bg).l)
    }
  })

  it('dark surfaces are tinted neutrals, not saturated: chroma <= 0.03 on bg/surface', () => {
    for (const p of PRESETS) {
      const c = generatePalette({ accent: accentOf(p) }, 'dark').colors
      expect(hexToOklch(c.bg).c, p).toBeLessThanOrEqual(0.02)
      expect(hexToOklch(c.surface).c, p).toBeLessThanOrEqual(0.026)
    }
  })

  it('accent chroma is clamped: Slate (very low chroma) still reads as tinted, saturated accents are capped', () => {
    const slate = hexToOklch(generatePalette({ accent: accentOf('Slate') }, 'light').colors.accent)
    expect(slate.c).toBeGreaterThanOrEqual(0.035)
    const loud = hexToOklch(generatePalette({ accent: '#ff00ff' }, 'light').colors.accent)
    expect(loud.c).toBeLessThanOrEqual(0.165)
  })
})

describe('generatePalette: contrast table holds for every preset and scheme', () => {
  const PAIRS: [ColorToken, ColorToken, number][] = [
    ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'surface2', 4.5], ['text', 'surface3', 4.5],
    ['muted', 'surface', 4.5], ['muted', 'surface2', 4.5],
    ['onAccent', 'accent', 4.5], ['accentText', 'surface', 4.5], ['accentText', 'soft', 4.5], ['accentText', 'softStrong', 4.5],
    ['accent', 'surface', 3], ['outline', 'surface', 3], ['outline', 'surface2', 3],
  ]
  it.each(CASES)('%s %s', (preset, scheme) => {
    const c = generatePalette({ accent: accentOf(preset) }, scheme).colors
    for (const [fg, bg, min] of PAIRS) {
      expect(contrastRatio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min)
    }
  })
})

describe('status palette per scheme', () => {
  it('generatePalette returns the fixed status colours for its scheme, whatever the accent', () => {
    for (const scheme of SCHEMES) {
      for (const accent of ['#3f7d58', '#c0392b', '#0f766e', '#b7791f']) {
        const p = generatePalette({ accent }, scheme)
        for (const n of STATUS_NAMES) expect(p.status[n], `${n} ${accent}`).toEqual(STATUS_PALETTE[n][scheme])
      }
    }
  })

  it('matches the plan 3.1 table', () => {
    expect(STATUS_PALETTE.leftover.light).toEqual({ fg: '#065353', bg: '#c2f3f2', solid: '#027879' })
    expect(STATUS_PALETTE.spoil.dark).toEqual({ fg: '#fec39b', bg: '#44250c', solid: '#9e5106' })
    expect(STATUS_PALETTE.danger.light.bg).toBe('#ffe0dc')
    expect(STATUS_PALETTE.success.dark.fg).toBe('#a7e2b2')
    expect(STATUS_PALETTE.pinned.light.solid).toBe('#5b5cb7')
  })

  it.each(STATUS_NAMES.flatMap((n) => SCHEMES.map((s) => [n, s] as const)))('%s %s: fg on bg >= 4.5, white on solid >= 4.5', (n, s) => {
    const c = STATUS_PALETTE[n][s]
    expect(contrastRatio(c.fg, c.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#ffffff', c.solid)).toBeGreaterThanOrEqual(4.5)
  })

  it('each status is a distinct hue family (never relies on one colour)', () => {
    const solids = new Set(STATUS_NAMES.map((n) => STATUS_PALETTE[n].light.solid))
    expect(solids.size).toBe(STATUS_NAMES.length)
  })
})

describe('css variables', () => {
  it('maps tokens to kebab-case custom properties, digits get their own segment', () => {
    expect(cssVarName('bg')).toBe('--color-bg')
    expect(cssVarName('surface2')).toBe('--color-surface-2')
    expect(cssVarName('surface3')).toBe('--color-surface-3')
    expect(cssVarName('onAccent')).toBe('--color-on-accent')
    expect(cssVarName('accentText')).toBe('--color-accent-text')
    expect(cssVarName('softStrong')).toBe('--color-soft-strong')
  })

  it('statusVarName', () => {
    expect(statusVarName('spoil', 'fg')).toBe('--status-spoil-fg')
    expect(statusVarName('pinned', 'solid')).toBe('--status-pinned-solid')
  })

  it('toCssVars emits every new colour token', () => {
    const p = generatePalette({ accent: accentOf('Teal') }, 'dark')
    const vars = toCssVars(p)
    for (const t of COLOR_TOKENS) expect(vars[cssVarName(t)], t).toBe(p.colors[t])
  })

  it('toCssVars emits all 15 status variables (5 statuses x fg|bg|solid)', () => {
    const p = generatePalette({ accent: accentOf('Teal') }, 'light')
    const vars = toCssVars(p)
    for (const n of STATUS_NAMES) {
      for (const part of ['fg', 'bg', 'solid'] as const) expect(vars[statusVarName(n, part)], `${n}-${part}`).toBe(p.status[n][part])
    }
    expect(Object.keys(vars).filter((k) => k.startsWith('--status-'))).toHaveLength(15)
  })

  it('old variable names are aliases carrying the new token values', () => {
    const p = generatePalette({ accent: accentOf('Aubergine') }, 'light')
    const vars = toCssVars(p)
    expect(Object.keys(COLOR_ALIASES).sort()).toEqual([
      'background', 'on-background', 'on-primary', 'on-primary-container', 'on-secondary', 'on-secondary-container',
      'on-surface', 'on-surface-variant', 'primary', 'primary-container', 'secondary', 'secondary-container',
      'surface-container', 'surface-container-high', 'surface-container-low',
    ])
    for (const [old, token] of Object.entries(COLOR_ALIASES)) {
      expect(vars[`--color-${old}`], `--color-${old}`).toBe(p.colors[token])
    }
    // spot-check the semantics screens rely on
    expect(vars['--color-primary']).toBe(p.colors.accent)
    expect(vars['--color-on-primary']).toBe(p.colors.onAccent)
    expect(vars['--color-on-surface']).toBe(p.colors.text)
    expect(vars['--color-surface-container']).toBe(p.colors.surface2)
    expect(vars['--color-primary-container']).toBe(p.colors.soft)
    expect(vars['--color-background']).toBe(p.colors.bg)
  })

  it('unchanged names (surface, outline) are written once from the new palette', () => {
    const p = generatePalette({ accent: accentOf('Slate') }, 'dark')
    const vars = toCssVars(p)
    expect(vars['--color-surface']).toBe(p.colors.surface)
    expect(vars['--color-outline']).toBe(p.colors.outline)
  })

  it('status colours stay out of the accent colour variables', () => {
    const vars = toCssVars(generatePalette({ accent: '#c0392b' }, 'light'))
    expect(Object.keys(vars).some((k) => k.startsWith('--color-') && /spoil|leftover|danger|success|pinned/.test(k))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'
import {
  STATUS_COLORS,
  cssVarName,
  generatePalette,
  toCssVars,
  type ColorToken,
  type Scheme,
} from './palette'

const ACCENTS = ['#e4572e', '#2e86ab', '#ffd400', '#3a7d44', '#7b2cbf', '#000000', '#ffffff', '#808080']
const SCHEMES: Scheme[] = ['light', 'dark']

// Every foreground/background pair the UI draws text on.
const PAIRS: [ColorToken, ColorToken][] = [
  ['onPrimary', 'primary'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'],
  ['onSecondaryContainer', 'secondaryContainer'],
  ['onBackground', 'background'],
  ['onSurface', 'surface'],
  ['onSurface', 'surfaceContainerLow'],
  ['onSurface', 'surfaceContainer'],
  ['onSurface', 'surfaceContainerHigh'],
  ['onSurfaceVariant', 'surface'],
  ['onSurfaceVariant', 'surfaceContainer'],
]

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
const spread = (hex: string) => {
  const c = channels(hex)
  return Math.max(...c) - Math.min(...c)
}
const luma = (hex: string) => {
  const [r, g, b] = channels(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('generatePalette', () => {
  it.each(ACCENTS.flatMap((a) => SCHEMES.map((s) => [a, s] as const)))(
    'accent %s / %s: every text pair meets WCAG AA (4.5:1)',
    (accent, scheme) => {
      const p = generatePalette({ accent }, scheme)
      for (const [fg, bg] of PAIRS) {
        expect(contrastRatio(p.colors[fg], p.colors[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('also passes AA with an explicit secondary', () => {
    for (const scheme of SCHEMES) {
      const p = generatePalette({ accent: '#e4572e', secondary: '#2e86ab' }, scheme)
      for (const [fg, bg] of PAIRS) {
        expect(contrastRatio(p.colors[fg], p.colors[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('returns every token as #rrggbb', () => {
    const p = generatePalette({ accent: '#2e86ab' }, 'light')
    expect(p.scheme).toBe('light')
    for (const v of Object.values(p.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is deterministic and accepts #rgb / upper-case input', () => {
    const a = generatePalette({ accent: '#E4572E' }, 'light')
    expect(generatePalette({ accent: '#e4572e' }, 'light')).toEqual(a)
    expect(generatePalette({ accent: '#fa0' }, 'light')).toEqual(generatePalette({ accent: '#ffaa00' }, 'light'))
  })

  it('throws on an invalid accent', () => {
    expect(() => generatePalette({ accent: 'banana' }, 'light')).toThrow(/hex/i)
    expect(() => generatePalette({ accent: '#e4572e', secondary: 'nope' }, 'light')).toThrow(/hex/i)
  })

  it('tints surfaces strongly from the accent (not neutral grey)', () => {
    const p = generatePalette({ accent: '#e4572e' }, 'light')
    for (const t of ['background', 'surface', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh'] as const) {
      expect(spread(p.colors[t]), t).toBeGreaterThanOrEqual(8)
    }
    // Warm accent -> red channel leads on the surface.
    const [r, , b] = channels(p.colors.surfaceContainer)
    expect(r).toBeGreaterThan(b)
  })

  it('steps surface containers up in emphasis (light: darker; dark: lighter)', () => {
    const light = generatePalette({ accent: '#2e86ab' }, 'light').colors
    expect(luma(light.surfaceContainerLow)).toBeGreaterThan(luma(light.surfaceContainer))
    expect(luma(light.surfaceContainer)).toBeGreaterThan(luma(light.surfaceContainerHigh))
    const dark = generatePalette({ accent: '#2e86ab' }, 'dark').colors
    expect(luma(dark.surfaceContainerLow)).toBeLessThan(luma(dark.surfaceContainer))
    expect(luma(dark.surfaceContainer)).toBeLessThan(luma(dark.surfaceContainerHigh))
  })

  it('dark surfaces are darker than light surfaces, and text flips', () => {
    const light = generatePalette({ accent: '#3a7d44' }, 'light').colors
    const dark = generatePalette({ accent: '#3a7d44' }, 'dark').colors
    expect(luma(dark.surface)).toBeLessThan(luma(light.surface))
    expect(luma(dark.onSurface)).toBeGreaterThan(luma(light.onSurface))
  })

  it('a different accent gives a different palette', () => {
    expect(generatePalette({ accent: '#e4572e' }, 'light').colors.primary).not.toBe(
      generatePalette({ accent: '#2e86ab' }, 'light').colors.primary,
    )
  })

  it('derives a secondary when none is given, and uses the given one otherwise', () => {
    const derived = generatePalette({ accent: '#e4572e' }, 'light').colors
    expect(derived.secondary).not.toBe(derived.primary)
    const given = generatePalette({ accent: '#e4572e', secondary: '#2e86ab' }, 'light').colors
    expect(given.secondaryContainer).not.toBe(derived.secondaryContainer)
    // The explicit secondary is blue-led; the primary stays red-led.
    const [sr, , sb] = channels(given.secondaryContainer)
    expect(sb).toBeGreaterThan(sr)
  })
})

describe('css variables', () => {
  it('maps tokens to kebab-case custom properties', () => {
    expect(cssVarName('primary')).toBe('--color-primary')
    expect(cssVarName('onPrimaryContainer')).toBe('--color-on-primary-container')
    expect(cssVarName('surfaceContainerHigh')).toBe('--color-surface-container-high')
  })

  it('toCssVars covers every token', () => {
    const p = generatePalette({ accent: '#2e86ab' }, 'dark')
    const vars = toCssVars(p)
    expect(Object.keys(vars)).toHaveLength(Object.keys(p.colors).length)
    expect(vars['--color-primary']).toBe(p.colors.primary)
    expect(vars['--color-on-surface-variant']).toBe(p.colors.onSurfaceVariant)
  })
})

describe('STATUS_COLORS', () => {
  it('has spoil and leftover for both schemes, each passing AA', () => {
    for (const status of ['spoil', 'leftover'] as const) {
      for (const scheme of SCHEMES) {
        const { bg, fg } = STATUS_COLORS[status][scheme]
        expect(contrastRatio(fg, bg), `${status}/${scheme}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('is fixed: spoil and leftover differ, and no accent changes them', () => {
    expect(STATUS_COLORS.spoil.light.bg).not.toBe(STATUS_COLORS.leftover.light.bg)
    const before = JSON.stringify(STATUS_COLORS)
    generatePalette({ accent: '#e4572e' }, 'light')
    generatePalette({ accent: '#2e86ab' }, 'dark')
    expect(JSON.stringify(STATUS_COLORS)).toBe(before)
  })

  it('is not emitted into the accent palette', () => {
    const vars = toCssVars(generatePalette({ accent: '#e4572e' }, 'light'))
    expect(Object.keys(vars).some((k) => /spoil|leftover/.test(k))).toBe(false)
  })
})

// B9-49 (RES-08): the User's theme kept on the device, so the first paint is already their colours. localStorage `feeder.theme`:
//   { scheme: 'light' | 'dark' | 'system', accent: '#rrggbb', light: BootPalette, dark: BootPalette }
//   BootPalette = { bg, surface, surface2, line, text, accent }   (six resolved colours; the --boot-* variables of index.html)
// Pure (theme/themeCache.ts): build from preferences, validate what was read, round-trip. Sign-out clears it (meCache.clearCachedMe).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCachedMe } from '../app/meCache'
import { generatePalette } from './palette'
import { bootPaletteOf, buildThemeCache, clearThemeCache, parseThemeCache, readThemeCache, resolveCachedScheme, THEME_CACHE_KEY, writeThemeCache } from './themeCache'

beforeEach(() => localStorage.clear())

const TOMATO = '#d9503f'

describe('buildThemeCache', () => {
  it('keeps the scheme choice and the accent, and resolves the six boot colours of both schemes from the generated palette', () => {
    const cache = buildThemeCache({ scheme: 'dark', accent: TOMATO })
    expect(cache.scheme).toBe('dark')
    expect(cache.accent).toBe(TOMATO)
    for (const scheme of ['light', 'dark'] as const) {
      const colors = generatePalette({ accent: TOMATO }, scheme).colors
      expect(cache[scheme]).toEqual({ bg: colors.bg, surface: colors.surface, surface2: colors.surface2, line: colors.line, text: colors.text, accent: colors.accent })
    }
  })

  it('"system" is kept as system: the first paint then follows the OS scheme', () => {
    expect(buildThemeCache({ scheme: 'system', accent: TOMATO }).scheme).toBe('system')
  })
})

describe('resolveCachedScheme and bootPaletteOf', () => {
  const cache = buildThemeCache({ scheme: 'system', accent: TOMATO })
  it('system follows prefers-color-scheme; light and dark are fixed', () => {
    expect(resolveCachedScheme(cache, true)).toBe('dark')
    expect(resolveCachedScheme(cache, false)).toBe('light')
    expect(resolveCachedScheme({ ...cache, scheme: 'dark' }, false)).toBe('dark')
    expect(resolveCachedScheme({ ...cache, scheme: 'light' }, true)).toBe('light')
  })
  it('the boot palette is the one of the resolved scheme', () => {
    expect(bootPaletteOf(cache, true)).toEqual(cache.dark)
    expect(bootPaletteOf(cache, false)).toEqual(cache.light)
  })
})

describe('parseThemeCache (what was read is never trusted)', () => {
  const good = buildThemeCache({ scheme: 'light', accent: TOMATO })
  it('accepts a well-formed value', () => expect(parseThemeCache(JSON.parse(JSON.stringify(good)))).toEqual(good))
  it.each([
    ['null', null],
    ['a string', 'dark'],
    ['an unknown scheme', { ...good, scheme: 'sepia' }],
    ['a bad accent', { ...good, accent: 'red' }],
    ['a missing palette', { scheme: 'dark', accent: TOMATO, light: good.light }],
    ['a colour that is not #rrggbb', { ...good, dark: { ...good.dark, bg: 'rgb(0,0,0)' } }],
    ['a palette missing a colour', { ...good, light: { bg: good.light.bg } }],
    ['a script smuggled into a colour (it is written into a style property)', { ...good, light: { ...good.light, accent: 'red;}</style><script>' } }],
  ])('rejects %s', (_name, value) => expect(parseThemeCache(value)).toBeNull())
})

describe('read, write, clear', () => {
  it('round-trips through localStorage under feeder.theme', () => {
    const cache = buildThemeCache({ scheme: 'dark', accent: TOMATO })
    writeThemeCache(cache)
    expect(localStorage.getItem(THEME_CACHE_KEY)).not.toBeNull()
    expect(THEME_CACHE_KEY).toBe('feeder.theme')
    expect(readThemeCache()).toEqual(cache)
  })

  it('a malformed or missing value reads as null', () => {
    expect(readThemeCache()).toBeNull()
    localStorage.setItem(THEME_CACHE_KEY, '{not json')
    expect(readThemeCache()).toBeNull()
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ scheme: 'dark' }))
    expect(readThemeCache()).toBeNull()
  })

  it('clearThemeCache forgets it', () => {
    writeThemeCache(buildThemeCache({ scheme: 'dark', accent: TOMATO }))
    clearThemeCache()
    expect(readThemeCache()).toBeNull()
  })

  it('signing out forgets the theme together with the remembered User (clearCachedMe)', () => {
    writeThemeCache(buildThemeCache({ scheme: 'dark', accent: TOMATO }))
    clearCachedMe()
    expect(readThemeCache()).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readThemeCache()).toBeNull()
    expect(() => writeThemeCache(buildThemeCache({ scheme: 'dark', accent: TOMATO }))).not.toThrow()
    expect(() => clearThemeCache()).not.toThrow()
    vi.restoreAllMocks()
  })
})

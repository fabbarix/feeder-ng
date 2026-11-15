// B9-49 (RES-08): the User's theme kept on the device, so the first paint is already their colours. Plain TypeScript.
// localStorage `feeder.theme` = { scheme, accent, light, dark }; each palette holds the six resolved boot colours (the --boot-*
// variables of index.html's inline script). Written from saved preferences only, never from a preview; cleared on sign-out.
import { normalizeHex } from './color'
import { generatePalette, type Scheme } from './palette'

export const THEME_CACHE_KEY = 'feeder.theme'

export type CachedScheme = Scheme | 'system'

export interface BootPalette {
  bg: string
  surface: string
  surface2: string
  line: string
  text: string
  accent: string
}

export interface ThemeCache {
  scheme: CachedScheme
  accent: string
  light: BootPalette
  dark: BootPalette
}

const BOOT_KEYS = ['bg', 'surface', 'surface2', 'line', 'text', 'accent'] as const
const HEX = /^#[0-9a-fA-F]{6}$/
const SCHEMES: readonly CachedScheme[] = ['light', 'dark', 'system']

function bootPalette(accent: string, scheme: Scheme): BootPalette {
  const c = generatePalette({ accent: normalizeHex(accent) }, scheme).colors
  return { bg: c.bg, surface: c.surface, surface2: c.surface2, line: c.line, text: c.text, accent: c.accent }
}

export function buildThemeCache(prefs: { scheme: CachedScheme; accent: string }): ThemeCache {
  return { scheme: prefs.scheme, accent: prefs.accent, light: bootPalette(prefs.accent, 'light'), dark: bootPalette(prefs.accent, 'dark') }
}

export function resolveCachedScheme(cache: ThemeCache, prefersDark: boolean): Scheme {
  if (cache.scheme === 'system') return prefersDark ? 'dark' : 'light'
  return cache.scheme
}

export function bootPaletteOf(cache: ThemeCache, prefersDark: boolean): BootPalette {
  return cache[resolveCachedScheme(cache, prefersDark)]
}

function parsePalette(v: unknown): BootPalette | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const k of BOOT_KEYS) {
    const c = o[k]
    if (typeof c !== 'string' || !HEX.test(c)) return null
    out[k] = c
  }
  return out as unknown as BootPalette
}

/** A cache read from storage, validated: every colour is #rrggbb (it is written into a style property). Null when anything is off. */
export function parseThemeCache(v: unknown): ThemeCache | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (!SCHEMES.includes(o.scheme as CachedScheme)) return null
  if (typeof o.accent !== 'string' || !HEX.test(o.accent)) return null
  const light = parsePalette(o.light)
  const dark = parsePalette(o.dark)
  if (!light || !dark) return null
  return { scheme: o.scheme as CachedScheme, accent: o.accent, light, dark }
}

export function readThemeCache(): ThemeCache | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY)
    return raw ? parseThemeCache(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeThemeCache(cache: ThemeCache): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage blocked: the next launch paints the defaults
  }
}

export function clearThemeCache(): void {
  try {
    localStorage.removeItem(THEME_CACHE_KEY)
  } catch {
    // nothing to forget
  }
}

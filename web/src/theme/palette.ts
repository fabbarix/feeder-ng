// Accent -> Bento palette for light and dark schemes, generated in OKLCH from the tone table in
// docs/design/ui-fix-plan.md section 3.1 (see docs/dev/design/wp1-tokens.md). Every text pair is
// checked to meet WCAG AA by contrast.test.ts. Status colours are fixed and never derived.
import { ensureContrast } from './contrast'
import { hexToOklch, normalizeHex, oklchToHex, type Hex, type Oklch } from './color'

export type { Hex } from './color'

export type Scheme = 'light' | 'dark'

export interface ThemeInput {
  accent: Hex
  /** Deprecated: ignored by the Bento palette, kept so existing callers compile. */
  secondary?: Hex
}

/** camelCase of the CSS variables --color-bg, --color-surface-2, --color-on-accent, ... */
export const COLOR_TOKENS = [
  'bg', 'surface', 'surface2', 'surface3', 'line', 'outline', 'text', 'muted',
  'accent', 'onAccent', 'accentText', 'soft', 'softStrong',
] as const
export type ColorToken = (typeof COLOR_TOKENS)[number]

export const STATUS_NAMES = ['leftover', 'spoil', 'danger', 'success', 'pinned'] as const
export type StatusName = (typeof STATUS_NAMES)[number]
export interface StatusColors {
  fg: Hex
  bg: Hex
  /** Solid fill; white text on it is >= 4.5:1. */
  solid: Hex
}

export interface Palette {
  scheme: Scheme
  colors: Record<ColorToken, Hex>
  status: Record<StatusName, StatusColors>
}

/** Fixed status colours (plan 3.1). Never derived from the accent. */
export const STATUS_PALETTE: Record<StatusName, Record<Scheme, StatusColors>> = {
  leftover: {
    light: { fg: '#065353', bg: '#c2f3f2', solid: '#027879' },
    dark: { fg: '#85e4e3', bg: '#043535', solid: '#027879' },
  },
  spoil: {
    light: { fg: '#6d3706', bg: '#fee1cf', solid: '#9e5106' },
    dark: { fg: '#fec39b', bg: '#44250c', solid: '#9e5106' },
  },
  danger: {
    light: { fg: '#742e2b', bg: '#ffe0dc', solid: '#ab413e' },
    dark: { fg: '#febfb9', bg: '#47211e', solid: '#ab413e' },
  },
  success: {
    light: { fg: '#115629', bg: '#d1f2d7', solid: '#0a7e3a' },
    dark: { fg: '#a7e2b2', bg: '#14361d', solid: '#0a7e3a' },
  },
  pinned: {
    light: { fg: '#3e3f7c', bg: '#e3e6fe', solid: '#5b5cb7' },
    dark: { fg: '#c7cdff', bg: '#282a4b', solid: '#5b5cb7' },
  },
}

/**
 * Old Material-style CSS variable (without the leading --color-) -> the Bento token whose value it
 * carries. Kept for one release so unmigrated screens keep working; remove in the release after.
 * Names that are unchanged (surface, outline) are not listed.
 */
export const COLOR_ALIASES: Readonly<Record<string, ColorToken>> = {
  background: 'bg',
  'on-background': 'text',
  'surface-container-low': 'surface',
  'surface-container': 'surface2',
  'surface-container-high': 'surface3',
  'on-surface': 'text',
  'on-surface-variant': 'muted',
  primary: 'accent',
  'on-primary': 'onAccent',
  'primary-container': 'soft',
  'on-primary-container': 'accentText',
  secondary: 'accent',
  'on-secondary': 'onAccent',
  'secondary-container': 'soft',
  'on-secondary-container': 'accentText',
}

/** Tone table (plan 3.1): [L, C] per token. 'C' = the accent's chroma clamped to 0.04..0.16. */
type Tone = readonly [l: number, c: number | 'C']
const TONES: Record<Scheme, Record<Exclude<ColorToken, 'onAccent'>, Tone>> = {
  light: {
    bg: [0.955, 0.018], surface: [0.995, 0.006], surface2: [0.925, 0.025], surface3: [0.885, 0.035],
    line: [0.86, 0.03], outline: [0.56, 0.03], text: [0.22, 0.02], muted: [0.45, 0.025],
    accent: [0.5, 'C'], accentText: [0.4, 'C'], soft: [0.9, 0.06], softStrong: [0.84, 0.09],
  },
  dark: {
    bg: [0.16, 0.012], surface: [0.215, 0.018], surface2: [0.27, 0.022], surface3: [0.32, 0.026],
    line: [0.35, 0.025], outline: [0.62, 0.03], text: [0.95, 0.01], muted: [0.78, 0.02],
    accent: [0.78, 'C'], accentText: [0.86, 'C'], soft: [0.32, 0.06], softStrong: [0.38, 0.08],
  },
}
/** Fixed on-accent colours: white in light, a dark tinted ink in dark (plan 3.1). */
const ON_ACCENT: Record<Scheme, Tone | Hex> = { light: '#ffffff', dark: [0.2, 0.04] }

const MIN_TEXT = 4.5
const MIN_BOUNDARY = 3

/** Safety net (plan 3.1): lifts fg until it meets min against every background. A no-op for the 7 presets. */
function guard(fg: Hex, backgrounds: Hex[], min: number): Hex {
  return backgrounds.reduce((current, bg) => ensureContrast(current, bg, min), fg)
}

/** Generates the Bento palette for an accent in one scheme (plan 3.1: OKLCH tones, accent hue, clamped chroma). */
export function generatePalette(input: ThemeInput, scheme: Scheme): Palette {
  const accent = normalizeHex(input.accent)
  const accentOklch = hexToOklch(accent)
  const hue = accentOklch.h
  const chroma = Math.min(0.16, Math.max(0.04, accentOklch.c))
  const at = ([l, c]: Tone): Hex => oklchToHex({ l, c: c === 'C' ? chroma : c, h: hue } satisfies Oklch)

  const raw = Object.fromEntries(
    (Object.keys(TONES[scheme]) as Exclude<ColorToken, 'onAccent'>[]).map((t) => [t, at(TONES[scheme][t])]),
  ) as Record<Exclude<ColorToken, 'onAccent'>, Hex>
  const onAccent = typeof ON_ACCENT[scheme] === 'string' ? (ON_ACCENT[scheme] as Hex) : at(ON_ACCENT[scheme] as Tone)

  const c: Record<ColorToken, Hex> = {
    ...raw,
    onAccent,
    text: guard(raw.text, [raw.bg, raw.surface, raw.surface2, raw.surface3], MIN_TEXT),
    muted: guard(raw.muted, [raw.surface, raw.surface2], MIN_TEXT),
    accent: guard(raw.accent, [raw.surface], MIN_BOUNDARY),
    accentText: guard(raw.accentText, [raw.surface, raw.soft, raw.softStrong], MIN_TEXT),
    outline: guard(raw.outline, [raw.surface, raw.surface2], MIN_BOUNDARY),
  }
  c.onAccent = guard(c.onAccent, [c.accent], MIN_TEXT)

  const status = Object.fromEntries(STATUS_NAMES.map((n) => [n, STATUS_PALETTE[n][scheme]])) as Record<StatusName, StatusColors>
  return { scheme, colors: c, status }
}

/** Maps a token to its CSS custom property, e.g. onAccent -> --color-on-accent, surface2 -> --color-surface-2. */
export function cssVarName(token: ColorToken): string {
  return `--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\D)(\d)/, '$1-$2')}`
}

/** CSS variable for a status colour part, e.g. ('spoil', 'fg') -> --status-spoil-fg. */
export function statusVarName(name: StatusName, part: keyof StatusColors): string {
  return `--status-${name}-${part}`
}

/**
 * Flat name -> value map for apply.ts: (a) every --color-<token>, (b) every alias in COLOR_ALIASES as
 * --color-<old> with the aliased value, (c) every --status-<name>-fg|bg|solid.
 */
export function toCssVars(palette: Palette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const token of COLOR_TOKENS) vars[cssVarName(token)] = palette.colors[token]
  for (const [old, token] of Object.entries(COLOR_ALIASES)) vars[`--color-${old}`] = palette.colors[token]
  for (const name of STATUS_NAMES) {
    for (const part of ['fg', 'bg', 'solid'] as const) vars[statusVarName(name, part)] = palette.status[name][part]
  }
  return vars
}

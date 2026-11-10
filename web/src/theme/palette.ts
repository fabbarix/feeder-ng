// Accent -> Bento palette for light and dark schemes, generated in OKLCH from the tone table in
// docs/design/ui-fix-plan.md section 3.1 (see docs/dev/design/wp1-tokens.md). Every text pair is
// checked to meet WCAG AA by contrast.test.ts. Status colours are fixed and never derived.
import { normalizeHex, type Hex } from './color'

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

/** STUB (WP1 Developer replaces): returns the accent for every token so the contract tests are red. */
export function generatePalette(input: ThemeInput, scheme: Scheme): Palette {
  const accent = normalizeHex(input.accent)
  const colors = Object.fromEntries(COLOR_TOKENS.map((t) => [t, accent])) as Record<ColorToken, Hex>
  const status = Object.fromEntries(STATUS_NAMES.map((n) => [n, STATUS_PALETTE[n][scheme]])) as Record<StatusName, StatusColors>
  return { scheme, colors, status }
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
 * STUB (WP1 Developer replaces): must emit, as a flat name -> value map,
 * (a) every --color-<token>, (b) every alias in COLOR_ALIASES as --color-<old> with the aliased value,
 * (c) every --status-<name>-fg|bg|solid.
 */
export function toCssVars(palette: Palette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const token of COLOR_TOKENS) vars[cssVarName(token)] = palette.colors[token]
  return vars
}

// Accent -> tonal palette for light and dark schemes (Material-You style).
// Surfaces are strongly tinted with the accent hue. Every text/background pair
// is checked to meet WCAG AA. Status colours are fixed and never derived.
import { ensureContrast } from './contrast'
import { BLACK_WHITE_CROSSOVER, hexToHsl, hslToHex, normalizeHex, relativeLuminance, type Hex, type Hsl } from './color'

export type { Hex } from './color'

export type Scheme = 'light' | 'dark'

export interface ThemeInput {
  accent: Hex
  secondary?: Hex
}

export type ColorToken =
  | 'primary'
  | 'onPrimary'
  | 'primaryContainer'
  | 'onPrimaryContainer'
  | 'secondary'
  | 'onSecondary'
  | 'secondaryContainer'
  | 'onSecondaryContainer'
  | 'background'
  | 'onBackground'
  | 'surface'
  | 'surfaceContainerLow'
  | 'surfaceContainer'
  | 'surfaceContainerHigh'
  | 'onSurface'
  | 'onSurfaceVariant'
  | 'outline'

export interface Palette {
  scheme: Scheme
  colors: Record<ColorToken, Hex>
}

/** Fixed, AA-passing colours for status chips. Never derived from the accent. */
export const STATUS_COLORS: Record<'spoil' | 'leftover', Record<Scheme, { bg: Hex; fg: Hex }>> = {
  spoil: {
    light: { bg: '#ffdad1', fg: '#5c1a00' },
    dark: { bg: '#7a2e12', fg: '#ffdbcf' },
  },
  leftover: {
    light: { bg: '#fff0b3', fg: '#4d3b00' },
    dark: { bg: '#5c4a00', fg: '#fff0b3' },
  },
}

// Surface lightness per scheme, from background to the most emphasised container.
const SURFACE_LIGHTNESS: Record<Scheme, { background: number; surface: number; low: number; container: number; high: number }> = {
  light: { background: 0.97, surface: 0.955, low: 0.94, container: 0.92, high: 0.9 },
  dark: { background: 0.07, surface: 0.09, low: 0.11, container: 0.14, high: 0.18 },
}

const CONTAINER_LIGHTNESS: Record<Scheme, number> = { light: 0.88, dark: 0.3 }

/** Text in the hue family that reads on bg, dark on light backgrounds and light on dark ones. */
function onColor(bg: Hex, hue: number, saturation: number): Hex {
  const onLight = relativeLuminance(bg) > BLACK_WHITE_CROSSOVER
  return ensureContrast(hslToHex({ h: hue, s: saturation, l: onLight ? 0.1 : 0.96 }), bg)
}

export function generatePalette(input: ThemeInput, scheme: Scheme): Palette {
  const accent = normalizeHex(input.accent)
  const accentHsl = hexToHsl(accent)
  const hue = accentHsl.h
  const surfaceSaturation = Math.max(accentHsl.s, 0.7)
  const containerSaturation = Math.max(accentHsl.s, 0.5)
  const light = scheme === 'light'
  const tones = SURFACE_LIGHTNESS[scheme]

  const secondary = input.secondary
    ? normalizeHex(input.secondary)
    : hslToHex({ h: (hue + 60) % 360, s: Math.max(accentHsl.s * 0.6, 0.35), l: light ? 0.42 : 0.72 })
  const secondaryHsl: Hsl = hexToHsl(secondary)
  const secondaryContainerSaturation = Math.max(secondaryHsl.s, 0.5)

  const background = hslToHex({ h: hue, s: surfaceSaturation, l: tones.background })
  const surface = hslToHex({ h: hue, s: surfaceSaturation, l: tones.surface })
  const surfaceContainerLow = hslToHex({ h: hue, s: surfaceSaturation, l: tones.low })
  const surfaceContainer = hslToHex({ h: hue, s: surfaceSaturation, l: tones.container })
  const surfaceContainerHigh = hslToHex({ h: hue, s: surfaceSaturation, l: tones.high })
  const primaryContainer = hslToHex({ h: hue, s: containerSaturation, l: CONTAINER_LIGHTNESS[scheme] })
  const secondaryContainer = hslToHex({
    h: secondaryHsl.h,
    s: secondaryContainerSaturation,
    l: CONTAINER_LIGHTNESS[scheme],
  })

  return {
    scheme,
    colors: {
      primary: accent,
      onPrimary: onColor(accent, hue, 0.2),
      primaryContainer,
      onPrimaryContainer: onColor(primaryContainer, hue, 0.4),
      secondary,
      onSecondary: onColor(secondary, secondaryHsl.h, 0.2),
      secondaryContainer,
      onSecondaryContainer: onColor(secondaryContainer, secondaryHsl.h, 0.4),
      background,
      onBackground: onColor(background, hue, 0.2),
      surface,
      surfaceContainerLow,
      surfaceContainer,
      surfaceContainerHigh,
      onSurface: onColor(surfaceContainerHigh, hue, 0.2),
      // Secondary text must pass against the darkest (light scheme) or lightest (dark scheme) surface.
      onSurfaceVariant: ensureContrast(
        hslToHex({ h: hue, s: 0.15, l: light ? 0.32 : 0.8 }),
        surfaceContainerHigh,
      ),
      outline: hslToHex({ h: hue, s: 0.12, l: light ? 0.5 : 0.6 }),
    },
  }
}

/** Maps a token to its CSS custom property, e.g. onPrimaryContainer -> --color-on-primary-container. */
export function cssVarName(token: ColorToken): string {
  return `--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

export function toCssVars(palette: Palette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const token of Object.keys(palette.colors) as ColorToken[]) {
    vars[cssVarName(token)] = palette.colors[token]
  }
  return vars
}

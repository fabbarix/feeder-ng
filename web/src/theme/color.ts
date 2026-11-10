// Colour maths: hex parsing, HSL and OKLCH conversion, WCAG relative luminance and contrast.
// Pure TypeScript, unit-tested through contrast.test.ts and palette.test.ts.

export type Hex = string

export interface Hsl {
  /** Hue in degrees, 0..360. */
  h: number
  /** Saturation, 0..1. */
  s: number
  /** Lightness, 0..1. */
  l: number
}

/** Lower-cases and expands #rgb to #rrggbb. Throws on anything else. */
export function normalizeHex(input: string): Hex {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!match) throw new Error(`Invalid hex color: ${input}`)
  const digits = match[1]!.toLowerCase()
  const full = digits.length === 3 ? digits.split('').map((c) => c + c).join('') : digits
  return `#${full}`
}

export function hexToRgb(hex: Hex): [number, number, number] {
  const n = parseInt(normalizeHex(hex).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): Hex {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function hexToHsl(hex: Hex): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = (((g - b) / delta) % 6 + 6) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

export function hslToHex({ h, s, l }: Hsl): Hex {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const sector = (((h % 360) + 360) % 360) / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  let rgb: [number, number, number]
  if (sector < 1) rgb = [chroma, x, 0]
  else if (sector < 2) rgb = [x, chroma, 0]
  else if (sector < 3) rgb = [0, chroma, x]
  else if (sector < 4) rgb = [0, x, chroma]
  else if (sector < 5) rgb = [x, 0, chroma]
  else rgb = [chroma, 0, x]
  const m = l - chroma / 2
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255)
}

/** WCAG 2.x relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(hex: Hex): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio, 1 .. 21. */
export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(normalizeHex(a))
  const lb = relativeLuminance(normalizeHex(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Luminance above which black text beats white text on that background. */
export const BLACK_WHITE_CROSSOVER = 0.179

export interface Oklch {
  /** Perceptual lightness, 0 (black) .. 1 (white). */
  l: number
  /** Chroma, 0 (grey) .. about 0.32 inside sRGB. */
  c: number
  /** Hue in degrees, 0..360. 0 for achromatic colours. */
  h: number
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** sRGB hex -> OKLCH (Ottosson). Achromatic colours (c < 1e-4) return h = 0. */
export function hexToOklch(hex: Hex): Oklch {
  const [r8, g8, b8] = hexToRgb(normalizeHex(hex))
  const r = srgbToLinear(r8 / 255)
  const g = srgbToLinear(g8 / 255)
  const b = srgbToLinear(b8 / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(A, B)
  if (c < 1e-4) return { l: L, c, h: 0 }
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return { l: L, c, h: (h + 360) % 360 }
}

/** OKLCH -> linear sRGB channels (unclamped). */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180
  const A = c * Math.cos(rad)
  const B = c * Math.sin(rad)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const EPS = 1e-6

/**
 * OKLCH -> sRGB hex. If the colour is outside the sRGB gamut, chroma is reduced
 * (binary search, lightness and hue kept) until it fits, then channels are rounded.
 */
export function oklchToHex(color: Oklch): Hex {
  const lightness = Math.min(1, Math.max(0, color.l))
  const hue = ((color.h % 360) + 360) % 360
  const inGamut = (c: number) =>
    oklchToLinear({ l: lightness, c, h: hue }).every((v) => v >= -EPS && v <= 1 + EPS)
  let c = Math.max(0, color.c)
  if (!inGamut(c)) {
    let lo = 0
    let hi = c
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(mid)) lo = mid
      else hi = mid
    }
    c = lo
  }
  const [r, g, b] = oklchToLinear({ l: lightness, c, h: hue }).map((v) => linearToSrgb(Math.min(1, Math.max(0, v))) * 255)
  return rgbToHex(r!, g!, b!)
}

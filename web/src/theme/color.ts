// Colour maths: hex parsing, HSL conversion, WCAG relative luminance and contrast.
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

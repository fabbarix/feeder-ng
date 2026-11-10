const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** "#RGB" or "#RRGGBB" (case-insensitive). */
export function isHex(text: string): boolean {
  return HEX.test(text)
}

/** "#2A7F62" / "#2a7" -> "#2a7f62" / "#22aa77"; null when invalid. */
export function normaliseHex(text: string): string | null {
  if (!isHex(text)) return null
  let digits = text.slice(1).toLowerCase()
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join('')
  return `#${digits}`
}

/** HSL to a "#rrggbb" string. */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const h = (((hue % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((h % 2) - 1))
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
  const m = lightness - c / 2
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

/** A saturated mid-tone for a hue 0..360 as "#rrggbb" (the picker's starting colour). */
export function hueToHex(hue: number): string {
  return hslToHex(hue, 0.6, 0.42)
}

/** Inverse for display: hue 0..360 of a hex colour. */
export function hexToHue(hex: string): number {
  const normal = normaliseHex(hex)
  if (!normal) return 0
  const r = parseInt(normal.slice(1, 3), 16) / 255
  const g = parseInt(normal.slice(3, 5), 16) / 255
  const b = parseInt(normal.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return Math.round((h * 60 + 360) % 360) % 360
}

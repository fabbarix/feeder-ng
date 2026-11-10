/** "#RGB" or "#RRGGBB" (case-insensitive). */
export function isHex(_text: string): boolean {
  throw new Error('not implemented')
}
/** "#2A7F62" / "#2a7" -> "#2a7f62" / "#22aa77"; null when invalid. */
export function normaliseHex(_text: string): string | null {
  throw new Error('not implemented')
}
/** A saturated mid-tone for a hue 0..360 as "#rrggbb" (the picker's starting colour). */
export function hueToHex(_hue: number): string {
  throw new Error('not implemented')
}
/** Inverse for display: hue 0..360 of a hex colour. */
export function hexToHue(_hex: string): number {
  throw new Error('not implemented')
}

export const ACCENT_PRESETS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Basil', hex: '#3f7d58' },
  { name: 'Tomato', hex: '#c0392b' },
  { name: 'Saffron', hex: '#b7791f' },
  { name: 'Blueberry', hex: '#3b5bdb' },
  { name: 'Aubergine', hex: '#7b3f8c' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Slate', hex: '#475569' },
]

/** '#rrggbb' (lower or upper case). */
export function isHexColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

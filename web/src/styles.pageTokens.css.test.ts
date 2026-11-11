// R2-L (L-01, R13 info tone): page-width tokens and the info status colours in styles.css.
import { describe, expect, it } from 'vitest'
import { readStylesCss } from './ui/test-utils'

const css = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first rule whose selector text contains `selector` (exact line start), '' when absent. */
function block(selector: string): string {
  const i = css.indexOf(selector)
  if (i < 0) return ''
  const open = css.indexOf('{', i)
  return css.slice(open + 1, css.indexOf('}', open))
}
const mediaBlock = (query: string) => {
  const i = css.indexOf(`@media (${query})`)
  if (i < 0) return ''
  const open = css.indexOf('{', i)
  let depth = 0
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j)
  }
  return ''
}
const decl = (body: string, prop: string) => new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim()

const lum = (hex: string) => {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

describe('page-width tokens (L-01)', () => {
  const root = block(':root {')
  it('defines the three content widths once', () => {
    expect(decl(root, '--page-narrow')).toBe('720px')
    expect(decl(root, '--page-default')).toBe('1120px')
    expect(decl(root, '--page-wide')).toBe('1480px')
  })
  it('--page-gutter follows the existing gutter ramp: 16 on phones, 24 from 768, 32 from 1200', () => {
    expect(decl(root, '--page-gutter')).toBe('var(--gutter)')
    expect(decl(root, '--gutter')).toBe('16px')
    expect(decl(mediaBlock('min-width: 768px'), '--gutter')).toBe('24px')
    expect(decl(mediaBlock('min-width: 1200px'), '--gutter')).toBe('32px')
  })
})

describe('info status colours (R13 asked for a distinct info tone)', () => {
  const surfaces = {
    'light (:root, [data-scheme=light])': { sel: ":root,\n[data-scheme='light'] {", bg: '#e7f4eb', surface: '#fafffc' },
    'dark ([data-scheme=dark])': { sel: ":root[data-scheme='dark'],\n[data-scheme='dark'] {", bg: '#090f0b', surface: '#131c16' },
    'dark before ThemeProvider (prefers-color-scheme)': { sel: ":root:not([data-scheme='light']) {", bg: '#090f0b', surface: '#131c16' },
  }
  for (const [name, { sel, bg, surface }] of Object.entries(surfaces)) {
    describe(name, () => {
      const body = block(sel)
      const fg = decl(body, '--color-info-fg') ?? ''
      const tint = decl(body, '--color-info-bg') ?? ''
      it('declares --color-info-fg and --color-info-bg as hex colours', () => {
        expect(fg).toMatch(/^#[0-9a-f]{6}$/)
        expect(tint).toMatch(/^#[0-9a-f]{6}$/)
      })
      it('fg on its own tint, on the surface and on the page background all reach 4.5:1', () => {
        expect(ratio(fg, tint)).toBeGreaterThanOrEqual(4.5)
        expect(ratio(fg, surface)).toBeGreaterThanOrEqual(4.5)
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
      })
      it('the tint is distinguishable from the surface (not the neutral soft tone)', () => {
        expect(tint).not.toBe(decl(body, '--color-soft'))
        expect(ratio(tint, surface)).toBeGreaterThan(1.05)
      })
    })
  }
})

describe('rail accent contrast tokens (L-04 precondition)', () => {
  it('on-accent on accent is >= 4.5 in both schemes (the bug was the soft fill, not the accent)', () => {
    const light = block(":root,\n[data-scheme='light'] {")
    const dark = block(":root[data-scheme='dark'],\n[data-scheme='dark'] {")
    expect(ratio(decl(light, '--color-on-accent')!, decl(light, '--color-accent')!)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(decl(dark, '--color-on-accent')!, decl(dark, '--color-accent')!)).toBeGreaterThanOrEqual(4.5)
  })
})

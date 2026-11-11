// R2-4 L-09: the Shopping List tiles fill the wide page (auto-fill, 240 px minimum) instead of two fixed columns.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('shop.css list grid', () => {
  it('.shop-lines .bento-grid is auto-fill with a 15rem (240 px) minimum', () => {
    const blocks = [...css.matchAll(/\.shop-lines \.bento-grid\s*\{([^}]*)\}/g)].map((m) => m[1]!.replace(/\s+/g, ' '))
    expect(blocks.some((b) => /grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(15rem, 100%\), 1fr\)\)/.test(b))).toBe(true)
  })
  it('no fixed two-column rule is left for the list', () => {
    expect(css).not.toMatch(/\.shop-lines \.bento-grid\s*\{[^}]*repeat\(2,/)
  })
  it('sets no max-width of its own: the Page owns the width', () => {
    expect(css).not.toMatch(/max-(inline-size|width)/)
  })
})

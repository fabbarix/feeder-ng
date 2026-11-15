// B9-43 (SSP-13, SSP-14; R-A, R-B, "footer buttons never crushed"): the open Line sheet's CSS.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8')
const rules = (selector: string): string => {
  const out: string[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (let m = re.exec(css); m; m = re.exec(css)) if (m[1]!.split(',').some((s) => s.trim() === selector)) out.push(m[2]!)
  return out.join('\n')
}

describe('shop.css: the open Line sheet', () => {
  it('the footer actions are a column of full-width buttons that never shrink below their text (no crushed button)', () => {
    const actions = rules('.shop-line-sheet__actions')
    expect(actions).toMatch(/display:\s*(flex|grid)/)
    expect(css).toMatch(/\.shop-line-sheet__actions\s*>\s*\*[^{]*\{[^}]*(min-inline-size|flex-shrink:\s*0|flex:\s*none)/)
  })

  it('the consequence line is meta text, muted, wrapping (never cut)', () => {
    const note = rules('.shop-line-sheet__consequence')
    expect(note).toMatch(/--text-meta/)
    expect(note).toMatch(/color:\s*var\(--color-text-muted\)/)
    expect(note).not.toMatch(/text-overflow|line-clamp|white-space:\s*nowrap/)
  })

  it('the "For" heading has its own rule and the Change the Price button is start-aligned, not stretched', () => {
    expect(rules('.shop-line-sheet__for-title')).toMatch(/--text-/)
    expect(rules('.shop-line-sheet__price')).toMatch(/align-self:\s*(flex-)?start/)
  })
})

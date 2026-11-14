// b8-shop: the phone wordmark. The brand shows at every width without crowding the avatar, in light and dark, with tokens only.
import { describe, expect, it } from 'vitest'
import { declarations } from '../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const shell = strip(readFileSync(`${cwd}/src/app/shell.css`, 'utf8'))
const styles = strip(readFileSync(`${cwd}/src/styles.css`, 'utf8'))

describe('top bar brand', () => {
  it('is an inline-flex row (mark, then word) that may shrink and never wraps', () => {
    const b = declarations(shell, '.top-bar__brand')
    expect(b['display']).toBe('inline-flex')
    expect(b['align-items']).toBe('center')
    expect(b['gap']).toMatch(/^var\(--space-[1-3]\)$/)
    expect(b['min-inline-size'] ?? b['min-width']).toBe('0')
    expect(declarations(shell, '.top-bar__brand-word')['white-space']).toBe('nowrap')
  })
  it('keeps the avatar at the right edge (margin-left: auto) on a phone', () => {
    expect(declarations(shell, '.your-menu-anchor')['margin-left']).toBe('auto')
  })
  it('the mark is a token size, its body the accent and its heart the brand heart token', () => {
    expect(declarations(shell, '.brand-mark')['inline-size']).toMatch(/^var\(--space-\d+\)$/)
    expect(declarations(shell, '.brand-mark__body')['fill']).toBe('var(--color-accent)')
    expect(declarations(shell, '.brand-mark__heart')['fill']).toBe('var(--brand-heart)')
  })
  it('the word uses the title-3 tokens and the text colour', () => {
    const b = declarations(shell, '.top-bar__brand')
    expect(b['font-size']).toBe('var(--text-title-3-size)')
    expect(b['color'] ?? 'var(--color-text)').toBe('var(--color-text)')
  })
  it('--brand-heart is a light colour and has the lighter dark value in both dark blocks', () => {
    expect(styles).toMatch(/--brand-heart:\s*#e0763a/i)
    const dark = [...styles.matchAll(/--brand-heart:\s*#f4a36b/gi)]
    expect(dark.length).toBeGreaterThanOrEqual(2)
  })
})

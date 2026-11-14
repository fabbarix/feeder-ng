// B9-01 / DS-12 R-D, R-D+: the CSS contract of Toast.css (read as text).
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('Toast.css')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ')

describe('Toast.css (R-D)', () => {
  it('the radius is --radius-button, not a raw 16 px', () => {
    expect(declarations(css, '.toast')['border-radius']).toBe('var(--radius-button)')
  })

  it('the headline is a flex line that centres the 16 px status icon on the first line', () => {
    const d = declarations(css, '.toast__title')
    expect(d['display']).toBe('flex')
    expect(d['align-items']).toBe('center')
    expect(d['gap']).toBe('var(--space-2)')
  })

  it('the subline is meta in a muted mix of bg and text (72 %)', () => {
    expect(declarations(css, '.toast__subline')['color']).toBe('color-mix(in srgb, var(--color-bg) 72%, var(--color-text))')
  })

  it('actions are 40 px outline pills in the bg colour on a 70 % ring', () => {
    const rules = ruleBlocks(css).filter((r) => r.selectors.some((s) => norm(s).startsWith('.toast__actions')))
    expect(rules.length).toBeGreaterThan(0)
    const body = rules.map((r) => norm(r.body)).join(' ')
    expect(body).toMatch(/block-size:\s*40px|min-block-size:\s*40px/)
    expect(body).toContain('var(--radius-pill)')
    expect(body).toMatch(/background:\s*transparent/)
    expect(body).toContain('var(--color-bg)')
    expect(body).toMatch(/color-mix\([^)]*var\(--color-bg\)\s*70%/)
  })

  it('the dismiss is a 32 px circle with a 55 % ring, top-aligned', () => {
    const d = declarations(css, '.toast__dismiss')
    expect(d['inline-size']).toBe('32px')
    expect(d['block-size']).toBe('32px')
    expect(d['border-radius']).toMatch(/50%|999|pill|full/)
    expect(d['box-shadow']).toMatch(/55%/)
    expect(d['align-self']).toBe('flex-start')
  })

  it('the focus ring on a toast is --color-bg: the toast sets --focus-ring-color once (A11Y-02), no ring rule of its own', () => {
    const own = ruleBlocks(css).filter((r) => r.selectors.some((s) => norm(s) === '.toast'))
    expect(own.map((r) => r.body).join(' ')).toMatch(/--focus-ring-color:\s*var\(--color-bg\)/)
    expect(ruleBlocks(css).filter((r) => r.selectors.some((s) => /:focus-visible/.test(norm(s))) && /outline/.test(r.body))).toEqual([])
  })

  it('the old column layout is gone: no .toast > svg, no tertiary action style', () => {
    expect(css).not.toMatch(/\.toast\s*>\s*svg/)
    expect(css).not.toContain("'tertiary'")
  })

  it('the icon colours on the toast fill (R-D+): error, warning and offline use their status backgrounds', () => {
    const body = ruleBlocks(css)
      .filter((r) => r.selectors.some((s) => norm(s).includes('.toast__title svg') || norm(s).includes('.toast__icon')))
      .map((r) => norm(r.body))
      .join(' ')
    expect(body).toContain('var(--status-danger-bg)')
    expect(body).toContain('var(--status-warn-bg)')
    expect(body).toContain('var(--color-info-bg)')
  })
})

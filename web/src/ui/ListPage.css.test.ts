// IH: ListPage.css contract: one token gap between the header, the search, the filters and the list.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('ListPage.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('ListPage.css', () => {
  it('exists', () => {
    expect(code.trim().length).toBeGreaterThan(0)
  })

  it('stacks its slots in a grid with a token gap of at least --space-3 (never zero, never a px literal)', () => {
    const d = declarations(css, '.list-page')
    expect(d['display']).toBe('grid')
    expect(d['gap']).toMatch(/^var\(--space-(3|4|5|6)\)$/)
  })

  it('does not collapse its columns', () => {
    expect(declarations(css, '.list-page')['min-inline-size']).toBe('0')
  })

  it('tokens only: no px lengths and no colour literals', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(/)
    expect(code).not.toMatch(/\b[1-9]\d*px\b/)
  })
})

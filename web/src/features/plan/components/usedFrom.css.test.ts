// CSS contract of the Used from section (jsdom does not lay out): token-based rules for every part.
import { describe, expect, it } from 'vitest'
import { readSource } from '../test-css'

const css = readSource('features/plan/components/usedFrom.css')
const source = readSource('features/plan/components/UsedFromSection.tsx')

describe('usedFrom.css', () => {
  it.each(['used-from__panel', 'used-from__line', 'used-from__lot', 'used-from__message', 'used-from__conflict'])('has a rule for .%s', (cls) => {
    expect(css).toMatch(new RegExp(`\\.${cls}\\s*[{,]`))
  })
  it('is built on design tokens: no hard-coded colours', () => {
    expect(css).toMatch(/var\(--/)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })
  it('the conflict rule uses an error token, not a literal colour', () => {
    const start = css.indexOf('.used-from__conflict')
    expect(css.slice(start, css.indexOf('}', start) + 1)).toMatch(/var\(--[a-z-]*(error|danger|spoil|warn)/)
  })
  it('the section imports its stylesheet', () => {
    expect(source).toMatch(/import ['"]\.\/usedFrom\.css['"]/)
  })
})

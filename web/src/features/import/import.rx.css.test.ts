// B9-28: what jsdom cannot check of the new Import screens: the sticky bar is one row, the Step text weight, two paths side by side from
// 45 em, long names wrap. Class names are the ones the tests pin: .import-start, .recipe-preview__step-text, .recipe-preview .list-row__title,
// .import-bar, .import-bar__next, .import-bar__next-label, .import-review [tabindex='-1'].
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/import/import.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`)
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}
const inMedia = (query: string): string => {
  const at = css.indexOf(`@media ${query}`)
  if (at < 0) return ''
  let depth = 0
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1)
  }
  return ''
}

describe('import.css (B9-28)', () => {
  it('the Step text of the preview is body weight 500, never bold (step rule, VC)', () => {
    expect(rule('.recipe-preview__step-text')).toMatch(/font-weight:\s*500/)
  })
  it('long Recipe names wrap in the row (to two lines) instead of being cut', () => {
    expect(rule('.recipe-preview .list-row__title')).toMatch(/white-space:\s*normal/)
  })
  it('the Import actions bar is one row at every width: no wrap, the meta shrinks and the buttons keep their size', () => {
    const bar = rule('.import-bar')
    expect(bar).toMatch(/display:\s*flex/)
    expect(bar).toMatch(/flex-wrap:\s*nowrap/)
    expect(rule('.import-bar__meta')).toMatch(/min-inline-size:\s*0/)
  })
  it('"Next question" is a 44 px icon-only button below 600 px (37.5 em), keeping its name', () => {
    const narrow = inMedia('(width < 37.5em)')
    expect(narrow).toMatch(/\.import-bar__next-label/)
    expect(narrow).toMatch(/\.import-bar__next\b[^{]*\{[^}]*(inline-size|min-inline-size):\s*44px/)
    // hidden visually only: the label stays in the accessible name
    expect(narrow).not.toMatch(/\.import-bar__next-label\s*\{[^}]*display:\s*none/)
  })
  // Ruling (main session): the page column decides, so the split is a container query at 45 rem on .import-start-frame, not a media query.
  it('the two paths stack below 45 rem of column and sit side by side from 45 rem', () => {
    expect(rule('.import-start')).toMatch(/display:\s*grid/)
    expect(rule('.import-start-frame')).toMatch(/container:\s*import-start\s*\/\s*inline-size/)
    const at = css.indexOf('@container import-start (min-width: 45rem)')
    expect(at).toBeGreaterThan(-1)
    expect(css.slice(at, css.indexOf('}', css.indexOf('}', at) + 1) + 1)).toMatch(/\.import-start\s*\{[^}]*grid-template-columns:\s*(repeat\(2|1fr 1fr)/)
  })
  it('a question row reached by "Next question" keeps clear of the sticky bar (scroll-margin) and shows no ring of its own', () => {
    const r = rule(".import-review [tabindex='-1']")
    expect(r).toMatch(/scroll-margin-block:[^;]*var\(--space-4\)/)
    expect(r).toMatch(/outline:\s*none/)
  })
  it('uses tokens only for colour: no hex or rgb literal in the new rules', () => {
    const block = [rule('.recipe-preview__step-text'), rule('.import-bar'), rule('.import-start')].join('\n')
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/)
  })
})

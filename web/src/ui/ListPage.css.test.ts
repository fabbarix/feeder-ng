// IH: ListPage.css contract: one token gap between the header, the search, the filters and the list.
import { describe, expect, it } from 'vitest'
import { declarations, readFeatureCss, readUiCss, ruleBlocks } from './test-utils'

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

  it('stacks the several children of the list slot (intro, list, action) with a token gap of at least --space-3', () => {
    const d = declarations(css, '.list-page__list')
    expect(d['display']).toBe('grid')
    expect(d['gap']).toMatch(/^var\(--space-(3|4|5|6)\)$/)
  })

  it('does not collapse its columns', () => {
    expect(declarations(css, '.list-page')['min-inline-size']).toBe('0')
  })

  it('lets the list slot shrink: one minmax(0, 1fr) column, or min-inline-size: 0 on its children (no 611px page at 390px)', () => {
    const d = declarations(css, '.list-page__list')
    const cols = (d['grid-template-columns'] ?? '').replace(/\s+/g, '')
    const shrinkingTemplate = cols === 'minmax(0,1fr)'
    const shrinkingChildren = ruleBlocks(css).some(
      (r) =>
        r.selectors.some((s) => /^\.list-page__list\s*>\s*(\*|:where\(\*\))$/.test(s)) &&
        /(^|;)\s*min-inline-size\s*:\s*0\s*(;|$)/.test(r.body),
    )
    expect(shrinkingTemplate || shrinkingChildren).toBe(true)
  })

  it('a Button directly in the list slot keeps its own width (justify-self: start on `.list-page__list > .button`, in ListPage.css or a feature stylesheet)', () => {
    const sheets = [css, readFeatureCss()]
    const ok = sheets.some((sheet) =>
      ruleBlocks(sheet).some(
        (r) =>
          r.selectors.some((s) => /^\.list-page__list\s*>\s*(\.button|button)(\[[^\]]*\])*$/.test(s)) &&
          /(^|;)\s*justify-self\s*:\s*(start|left|flex-start|self-start)\s*(;|$)/.test(r.body),
      ),
    )
    expect(ok).toBe(true)
  })

  it('tokens only: no px lengths and no colour literals', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(/)
    expect(code).not.toMatch(/\b[1-9]\d*px\b/)
  })
})

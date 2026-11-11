// CSS contract of the import screen that jsdom cannot check: the #read landing, the chosen thumbnail.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/import/import.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`)
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('import.css', () => {
  it('the programmatically focused step headings keep clear of the sticky chrome (scroll-margin) and show no ring', () => {
    const r = rule('.import-screen h2[tabindex=\'-1\']')
    expect(r).toMatch(/scroll-margin-block-start:\s*var\(--/)
    expect(r).toMatch(/outline:\s*none/)
  })
  it('a keyboard-focused heading would still get a ring (focus-visible), the programmatic one not', () => {
    expect(css).toMatch(/import-screen h2\[tabindex='-1'\]:focus-visible/)
  })
  it('the chosen thumbnail has a ring and a check badge, not only a border colour', () => {
    expect(rule(".photo-choice__radio[aria-checked='true']")).toMatch(/box-shadow:/)
    expect(css).toMatch(/\.photo-choice__check\s*\{/)
  })
  it('the removed ReadSourceChoice options have no styles left', () => {
    expect(css).not.toMatch(/read-source__option/)
  })
})

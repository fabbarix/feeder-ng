// Review of hf-recipes-filter round 3: a Tag of up to 40 characters must not push its row past the list at phone width. The guard
// found it at 390 px once its seed really created a long Tag: the pill kept its width (ListRow's leading slot is flex: none), the
// usage line was squeezed to 0 px and the chevron spilled 20 px past the list (P11, P13). jsdom does not lay out, so this pins the CSS.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/tags/tags.css').replace(/\/\*[\s\S]*?\*\//g, '')
const screen = readSource('features/tags/screens/TagsScreen.tsx')
const body = (selector: string) => {
  const m = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
  return m?.[1] ?? ''
}

describe('tags.css: a long Tag fits its row', () => {
  it('the Tags screen scopes its rules with .tags-screen on its ListPage', () => {
    expect(screen).toMatch(/<ListPage className="tags-screen"/)
  })
  it("a row's pill may shrink, to at most 65% of the row", () => {
    const b = body('.tags-screen .list-row__leading')
    expect(b).toMatch(/flex:\s*0 1 auto/)
    expect(b).toMatch(/min-inline-size:\s*0/)
    expect(b).toMatch(/max-inline-size:\s*65%/)
  })
  it('the pill itself can shrink below its text (its label ends in an ellipsis)', () => {
    const b = body('.tags-screen .list-row__leading > .chip')
    expect(b).toMatch(/min-inline-size:\s*0/)
    expect(b).toMatch(/max-inline-size:\s*100%/)
  })
})

// b8-recipes: the Recipe card must not spill at 1180 px (docs/dev/design/b8-recipes.md 1). The guard (P11/P13) found an <li> of the
// Tag and Course chip rows wider than its card: a flex item is min-inline-size: auto, so a long Tag name kept its natural width.
// jsdom does not lay out, so the contract is pinned in the source; the guard's full run (PAGE_LAYOUT=full, /recipes) is the proof.
import { describe, expect, it } from 'vitest'
import { rule, stylesheet } from '../../test/cssRules'

const { base } = stylesheet('src/features/recipes/recipes.css')

describe.each(['.recipe-tags > li', '.course-chips > li'])('Recipe card chip row item %s', (selector) => {
  const decls = rule(base, selector)
  it('may shrink below its content (min-inline-size: 0) so the Chip ellipsis cuts a long name', () => {
    expect(decls['min-inline-size']).toBe('0')
  })
  it('is capped to its row (max-inline-size: 100%)', () => {
    expect(decls['max-inline-size']).toBe('100%')
  })
})

describe('the Recipe card itself', () => {
  it('keeps min-inline-size: 0 on the tile and its chip rows are wrapping flex rows', () => {
    expect(rule(base, '.recipe-tile')['min-inline-size']).toBe('0')
    expect(rule(base, '.recipe-tags')['flex-wrap']).toBe('wrap')
  })
})

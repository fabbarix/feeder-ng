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

// B9-51 (SET-11, P40): the Tag is the row's title (at most two lines, a long one ends in an ellipsis), the count its value, which never
// shrinks; the leading is the 40 px TagSwatch, so the old rules that let a pill shrink to 65 % of the row are gone.
describe('tags.css: a long Tag fits its row', () => {
  it('the Tags screen scopes its rules with .tags-screen on its ListPage', () => {
    expect(screen).toMatch(/<ListPage className="tags-screen"/)
  })
  it('the title takes at most two lines, wrapping at a word, never mid-word (system.md 3)', () => {
    const b = body('.tags-screen .list-row__title')
    expect(b).toMatch(/-webkit-line-clamp:\s*2/)
    expect(b).toMatch(/overflow:\s*hidden/)
    expect(css).not.toMatch(/overflow-wrap:\s*(anywhere|break-word)|word-wrap:\s*(anywhere|break-word)|word-break:\s*break-(all|word)|hyphens:\s*auto/)
  })
  it('the count never shrinks, so "12 Recipes" is never cut', () => {
    expect(body('.tags-screen .list-row__value')).toMatch(/flex-shrink:\s*0|flex:\s*none|flex:\s*0 0 auto|white-space:\s*nowrap/)
  })
  it('the old pill rules are gone', () => {
    expect(css).not.toContain('max-inline-size: 65%')
    expect(css).not.toMatch(/\.list-row__leading\s*>\s*\.chip/)
  })
  it('the screen draws the swatch, not a Chip, as the leading', () => {
    expect(screen).toMatch(/TagSwatch/)
    expect(screen).not.toMatch(/leading=\{<Chip/)
  })
})

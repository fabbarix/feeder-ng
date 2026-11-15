// B9-19 (SHORT-05, system.md 11.5): every gutter is max(gutter, inset) on its own side, so a notch or rounded corner never covers a
// title, a row picture or the avatar. Page.css reads the --safe-* tokens (styles.css); the shell zeroes --safe-left where the compact
// rail already took the left inset.
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss, readUiCss } from './test-utils'

describe('Page gutters take the safe-area insets (SHORT-05)', () => {
  it('.page pads each side by max(--page-gutter, the inset on that side)', () => {
    const page = declarations(readUiCss('Page.css'), '.page')
    expect(page['padding-inline']).toBe('max(var(--page-gutter), var(--safe-left)) max(var(--page-gutter), var(--safe-right))')
  })

  it('the --safe-* tokens are the env() insets with 0 fallbacks (B9-02), and nothing in Page.css reads env() itself', () => {
    const root = declarations(readStylesCss(), ':root')
    for (const side of ['top', 'right', 'bottom', 'left']) expect(root[`--safe-${side}`]).toBe(`env(safe-area-inset-${side}, 0px)`)
    expect(readUiCss('Page.css')).not.toMatch(/env\(/)
  })

  it('the max-width cap still adds the two page gutters, not the insets (the cap is the column, the inset is padding)', () => {
    expect(declarations(readUiCss('Page.css'), '.page')['--page-max']).toBe('calc(var(--page-default) + 2 * var(--page-gutter))')
  })
})

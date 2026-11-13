// pantry-filter: the Pantry's own CSS around the shared filter header (docs/design/pantry-filter.md 2.9, 3). jsdom does not lay out;
// the guard checks the real build (P17 to P21 on /pantry, closed and open).
import { describe, expect, it } from 'vitest'
import { cssRules } from '../../test/cssRules'

const { rules, valueFor, valueAt } = cssRules(['features/stock/stock.css'])

const shared = cssRules(['ui/FilterBar/FilterBar.css'])

describe('the Filters panel', () => {
  it('keeps the shared width, 24 rem, which is the L-06 aside\'s width (so, end-aligned to Filters, it starts at the content start)', () => {
    expect(rules.filter((r) => /pantry-filters__panel\s*$/.test(r.selector) && /inline-size/.test(r.body))).toEqual([])
    expect(shared.valueFor('.filter-panel', 'inline-size', 0)).toBe('min(24rem, 100vw - 2 * var(--space-4))')
    expect(valueAt('.stock-screen__layout', 'grid-template-columns', 1280)).toMatch(/^24rem /)
  })
  it('caps its Storage Place list so the popover fits a 900 px high desktop', () => {
    expect(valueFor(".pantry-filters__panel .filter-panel__list [role='listbox']", 'max-block-size', 0)).toBe('min(16rem, 40dvh)')
  })
})

describe('the L-06 aside from 1280 px', () => {
  it('scrolls, so it is padded for focus rings and the hit area under the chip line, its content on the column edges', () => {
    expect(valueAt('.stock-screen__aside', 'overflow-y', 1280)).toBe('auto')
    expect(valueAt('.stock-screen__aside', 'padding-inline', 1280)).toBe('var(--space-2)')
    expect(valueAt('.stock-screen__aside', 'margin-inline', 1280)).toBe('calc(-1 * var(--space-2))')
    expect(valueAt('.stock-screen__aside', 'padding-block', 1280)).toBe('var(--space-2) var(--space-3)')
  })
})

describe('the old stacked controls are gone', () => {
  it('no .stock-screen__controls', () => {
    expect(rules.filter((r) => r.selector.includes('stock-screen__controls'))).toEqual([])
  })
})

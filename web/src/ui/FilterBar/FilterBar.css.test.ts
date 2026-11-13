// The CSS contract of the shared filter header (docs/design/recipes-filter.md 3, 13, 14; pantry-filter.md 3, 5). jsdom does not
// lay out: the rows and the chip line are pinned here and checked in a browser by the page-layout guard (P16 to P21).
import { describe, expect, it } from 'vitest'
import { cssRules } from '../../test/cssRules'

const { rules, valueFor } = cssRules(['ui/FilterBar/FilterBar.css'])
const WIDTHS = [0, 390, 768, 1280, 1920]

describe('the rows', () => {
  it.each(['.filter-bar__row', '.filter-chips'])('%s is one flex line at every width', (sel) => {
    for (const w of WIDTHS) {
      expect(valueFor(sel, 'display', w), `${sel} @${w}`).toBe('flex')
      expect(valueFor(sel, 'flex-wrap', w), `${sel} @${w}`).toBe('nowrap')
      expect(valueFor(sel, 'min-inline-size', w), `${sel} @${w}`).toBe('0')
    }
  })
  it('a header outside a ListPage stacks its rows one slot gap (the ListPage gap) apart', () => {
    expect(valueFor('.filter-bar', 'display', 0)).toBe('grid')
    expect(valueFor('.filter-bar', 'gap', 0)).toBe('var(--space-4)')
    expect(valueFor('.filter-bar', 'grid-template-columns', 0)).toBe('minmax(0, 1fr)')
  })
})

// pantry-filter review (the user's decision): below 420 px the Sort chip has no leading sort icon, on the Recipes and the Pantry
// headers alike, so "Good until" fits at 360 px; from 420 px the icon is back.
describe('row 2: the Sort chip below 420 px', () => {
  it.each([360, 390, 419])('at %i px the Sort chip hides its leading icon', (w) => {
    expect(valueFor('.filter-bar__sort .select__leading', 'display', w)).toBe('none')
  })
  it.each([420, 768, 1440])('at %i px it keeps it', (w) => {
    expect(valueFor('.filter-bar__sort .select__leading', 'display', w)).toBeUndefined()
  })
  it('only the Sort chip of a filter header: no other Select loses its leading visual', () => {
    const hidden = rules.filter((r) => /select__leading/.test(r.selector))
    expect(hidden.map((r) => r.selector)).toEqual(['.filter-bar__sort .select__leading'])
  })
})

describe('a line of toggle chips in the panel', () => {
  it('is one line that scrolls sideways, its chips at their natural width', () => {
    expect(valueFor('.filter-chip-group', 'flex-wrap', 0)).toBe('nowrap')
    expect(valueFor('.filter-chip-group', 'overflow-x', 0)).toBe('auto')
    expect(valueFor('.filter-chip-group > .chip', 'flex', 0)).toBe('none')
  })
  it('is padded for the focus ring, with a matching negative margin, and ends in a spacer', () => {
    expect(valueFor('.filter-chip-group', 'padding', 0)).toBe('var(--space-2)')
    expect(valueFor('.filter-chip-group', 'margin-inline', 0)).toBe('calc(-1 * var(--space-2))')
    expect(valueFor('.filter-chip-group::after', 'inline-size', 0)).toBe('var(--space-2)')
  })
})

describe('the panel', () => {
  it('a long list scrolls inside a capped height', () => {
    expect(valueFor(".filter-panel__list [role='listbox']", 'overflow-y', 0)).toBe('auto')
    expect(valueFor(".filter-panel__list [role='listbox']", 'max-block-size', 0)).toBeDefined()
  })
})

describe('tokens only', () => {
  it('no colour literal and no raw font size', () => {
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) {
      expect(r.body, r.selector).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i)
      expect(r.body, r.selector).not.toMatch(/font-size:\s*(?!var\(--text-)\S/)
    }
  })
})

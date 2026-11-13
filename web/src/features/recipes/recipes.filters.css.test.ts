// hf-recipes-filter: CSS contract of the Recipes filter header (docs/design/recipes-filter.md 3). jsdom does not lay out, so the
// one-line rows are pinned here and checked in a browser by the page-layout guard (P1, P13, P14, P16) and
// scripts/test/page-layout-recipes-header_test.sh.
import { describe, expect, it } from 'vitest'
import { recipeRules, rulesFor, valueFor } from './rules.test-helper'

const WIDTHS = [0, 390, 600, 768, 834, 1024, 1440, 1920]
const ROWS = ['.recipe-filters__row', '.recipe-filters__chips']

describe('every header row is one line at every width', () => {
  it.each(ROWS)('%s is a flex row that never wraps, with a token gap, and may shrink', (sel) => {
    for (const w of WIDTHS) {
      expect(valueFor(sel, 'display', w), `${sel} @${w}`).toBe('flex')
      expect(valueFor(sel, 'flex-wrap', w), `${sel} @${w}`).toBe('nowrap')
      expect(valueFor(sel, 'gap', w), `${sel} @${w}`).toMatch(/^var\(--space-/)
      expect(valueFor(sel, 'min-inline-size', w), `${sel} @${w}`).toBe('0')
      expect(valueFor(sel, 'align-items', w), `${sel} @${w}`).toBe('center')
    }
  })
})

describe('row 1: search and Filters', () => {
  it('the search takes the free space and may shrink', () => {
    expect(valueFor('.recipe-filters__search-row > .ui-field', 'flex', 0)).toBe('1 1 auto')
    expect(valueFor('.recipe-filters__search-row > .ui-field', 'min-inline-size', 0)).toBe('0')
  })
  it('the Filters button keeps its natural width', () => {
    expect(valueFor('.recipe-filters__search-row > .button', 'flex', 0)).toBe('none')
  })
})

describe('row 2: Kind and Sort', () => {
  it('puts Kind at the start and Sort at the end', () => {
    expect(valueFor('.recipe-filters__view-row', 'justify-content', 0)).toBe('space-between')
  })
  it('Kind keeps its natural width, Sort may shrink (its value ends in an ellipsis)', () => {
    expect(valueFor('.recipe-filters__view-row > .ui-field:first-child', 'flex', 0)).toBe('none')
    expect(valueFor('.recipe-filters__sort', 'flex', 0)).toBe('0 1 auto')
    expect(valueFor('.recipe-filters__sort', 'min-inline-size', 0)).toBe('0')
  })
})

describe('row 3: the active filter chips', () => {
  it('clips what does not fit instead of scrolling sideways (the rest is "+N")', () => {
    expect(valueFor('.recipe-filters__chips', 'overflow', 0)).toBe('hidden')
  })
  it('a chip keeps room for four characters and its close icon, never shrinking to a dot', () => {
    expect(valueFor('.recipe-filters__chips > .chip', 'flex', 0)).toBe('0 1 auto')
    expect(valueFor('.recipe-filters__chips > .chip', 'min-inline-size', 0)).toMatch(/^(\d+(\.\d+)?rem|calc\(.+\))$/)
  })
  it('the "+N" chip never shrinks', () => {
    expect(valueFor('.recipe-filters__more', 'flex', 0)).toBe('none')
  })
})

describe('the Course group in the panel is one line', () => {
  it('does not wrap: it scrolls sideways, and its chips keep their natural width', () => {
    expect(valueFor('.course-filter', 'flex-wrap', 0)).toBe('nowrap')
    expect(valueFor('.course-filter', 'overflow-x', 0)).toBe('auto')
    expect(valueFor('.course-filter > .chip', 'flex', 0)).toBe('none')
  })
})

describe('the Filters panel', () => {
  it('the popover is at most 24 rem wide and never wider than the viewport', () => {
    expect(valueFor('.recipe-filters__panel', 'inline-size', 768)).toMatch(/^min\(24rem,\s*100vw - 2 \* var\(--space-4\)\)$/)
  })
  it('the Tag list scrolls inside a capped height', () => {
    expect(valueFor('.recipe-filters__tags [role="listbox"]', 'overflow-y', 0)).toBe('auto')
    expect(valueFor('.recipe-filters__tags [role="listbox"]', 'max-block-size', 0)).toBeDefined()
  })
  it('section headings use the label type role', () => {
    expect(valueFor('.recipe-filters__heading', 'font-size', 0)).toBe('var(--text-label-size)')
  })
})

describe('the old header is gone', () => {
  it('no .tag-chips row and no fixed-width .recipes-sort box', () => {
    expect(rulesFor('.tag-chips')).toHaveLength(0)
    expect(rulesFor('.recipes-sort')).toHaveLength(0)
  })
  it('the new rules use no colour literal and no raw font size', () => {
    const rules = recipeRules.filter((x) => x.selector.includes('recipe-filters'))
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) {
      expect(r.body, r.selector).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i)
      expect(r.body, r.selector).not.toMatch(/font-size:\s*(?!var\(--text-)\S/)
    }
  })
})

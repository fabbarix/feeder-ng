// hf-recipes-filter: CSS contract of the Recipes filter header (docs/design/recipes-filter.md 3). jsdom does not lay out, so the
// one-line rows are pinned here and checked in a browser by the page-layout guard (P1, P13, P14, P16) and
// scripts/test/page-layout-recipes-header_test.sh.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'
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
  it('never scrolls sideways (what does not fit is "+N", not rendered)', () => {
    expect(valueFor('.recipe-filters__chips', 'overflow-x', 0) ?? valueFor('.recipe-filters__chips', 'overflow', 0) ?? 'visible').not.toMatch(/auto|scroll/)
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

// Round 2 (docs/design/recipes-filter.md 13): what the review of bb354d3c found in the browser.
const styles = readSource('styles.css')
/** px of a length: '12px', 'var(--space-3)', 'calc(-1 * var(--space-2))' (sign kept); NaN when it cannot be read. */
function px(value: string | undefined): number {
  if (!value) return NaN
  const v = value.trim()
  const token = /^(-)?var\((--[\w-]+)\)$/.exec(v)
  if (token) {
    const m = new RegExp(`${token[2]}:\\s*(-?[\\d.]+)px`).exec(styles)
    return m ? (token[1] ? -1 : 1) * Number(m[1]) : NaN
  }
  const neg = /^calc\(\s*-1\s*\*\s*(.+)\)$/.exec(v)
  if (neg) return -px(neg[1])
  const plain = /^(-?[\d.]+)px$/.exec(v)
  return plain ? Number(plain[1]) : v === '0' ? 0 : NaN
}
/** The block or inline padding of a selector at width 0: padding-block / padding-inline, else the matching part of padding. */
function padding(sel: string, axis: 'block' | 'inline'): number {
  const own = valueFor(sel, `padding-${axis}`, 0)
  if (own) return px(own.split(' ')[0])
  const all = (valueFor(sel, 'padding', 0) ?? '').split(' ').filter(Boolean)
  if (all.length === 0) return 0
  return px(axis === 'block' ? all[0] : (all[1] ?? all[0]))
}
const RING = 3 + 2 // outline 3 px + offset 2 px (Chip.css button.chip:focus-visible)
const HIT = 9 // a removable chip's ::before reaches 9 px above and below it (Chip.css)

describe('round 2: the chip line measures natural widths', () => {
  it('the measuring copy is as wide as its content, not the line, and its chips never shrink', () => {
    expect(valueFor('.recipe-filters__measure', 'inline-size', 0)).toBe('max-content')
    expect(valueFor('.recipe-filters__measure', 'inset-inline', 0)).toBeUndefined()
    expect(valueFor('.recipe-filters__measure > .chip', 'flex', 0)).toBe('none')
    expect(valueFor('.recipe-filters__measure > .chip', 'min-inline-size', 0)).toBeUndefined()
  })
})

describe('round 2: focus rings and hit areas are never clipped', () => {
  it('the chip line does not clip with overflow: hidden; if it clips, its clip margin holds the ring and the 44 px hit area', () => {
    const overflow = valueFor('.recipe-filters__chips', 'overflow', 0) ?? 'visible'
    expect(overflow).not.toBe('hidden')
    if (overflow === 'clip') expect(px(valueFor('.recipe-filters__chips', 'overflow-clip-margin', 0))).toBeGreaterThanOrEqual(Math.max(RING, HIT))
  })
  it('the Course line (a sideways scroller) is padded on both axes for the ring of "All Courses", with matching negative margins', () => {
    expect(padding('.course-filter', 'block')).toBeGreaterThanOrEqual(RING)
    expect(padding('.course-filter', 'inline')).toBeGreaterThanOrEqual(RING)
    const margin = valueFor('.course-filter', 'margin-inline', 0) ?? valueFor('.course-filter', 'margin', 0)?.split(' ')[1]
    expect(px(margin)).toBe(-padding('.course-filter', 'inline'))
  })
})

describe('round 2: spacing', () => {
  const listPageGap = /\.list-page\s*\{[^}]*gap:\s*([^;]+);/.exec(readSource('ui/ListPage.css').replace(/\/\*[\s\S]*?\*\//g, ''))?.[1]?.trim()
  it('row 3 sits one slot gap below row 2: the Recipes filters slot stacks its rows with the ListPage gap', () => {
    expect(listPageGap).toBe('var(--space-4)')
    for (const w of WIDTHS) {
      expect(valueFor('.recipes-screen .list-page__filters', 'display', w), `@${w}`).toBe('grid')
      expect(valueFor('.recipes-screen .list-page__filters', 'gap', w), `@${w}`).toBe(listPageGap)
    }
  })
  it('the panel spaces its own sections (the bottom sheet has no .popover__body)', () => {
    expect(valueFor('.recipe-filters__body', 'display', 0)).toBe('flex')
    expect(valueFor('.recipe-filters__body', 'flex-direction', 0)).toBe('column')
    expect(px(valueFor('.recipe-filters__body', 'gap', 0))).toBeGreaterThanOrEqual(12)
  })
  it('recipes.css never styles the shared .popover__body', () => {
    expect(recipeRules.filter((r) => r.selector.includes('popover__body'))).toEqual([])
  })
})


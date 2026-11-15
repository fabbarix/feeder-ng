// Sort-drag: CSS contract of the drag handles in the Recipe editor (jsdom does not lay out; docs/dev/design/sort-drag.md section 6).
import { describe, expect, it } from 'vitest'
import { rulesFor, valueFor } from './rules.test-helper'

describe('ingredient line: the handle lives inside the Ingredient cell, so the grid tracks do not change', () => {
  // B9-37: the one-row switch is at 42rem (672 px) of the lines box now.
  it('the Ingredient cell is a flex row that lines the handle up with the field, on a phone and from 672', () => {
    expect(valueFor('.line-row__ingredient', 'display', 0)).toBe('flex')
    expect(valueFor('.line-row__ingredient', 'display', 672)).toBe('flex')
    expect(valueFor('.line-row__ingredient', 'align-items', 0)).toMatch(/end/)
    expect(valueFor('.line-row__ingredient', 'gap', 0)).toMatch(/^var\(--space-/)
  })
  it('the handle holder does not shrink and has no label height of its own', () => {
    expect(valueFor('.line-row__handle', 'flex', 0)).toMatch(/^(none|0 0 auto)$/)
  })
  it('the handle is as tall as the 48 px field, so it is centred on it at every width (the cell centres its children from 672)', () => {
    expect(valueFor('.line-row__handle', 'block-size', 0)).toBe('48px')
    expect(valueFor('.line-row__ingredient', 'align-items', 672)).toBe('center')
  })
  it('a pending (Ready Meal) line keeps its column layout for the summary', () => {
    expect(rulesFor('.line-row--pending > .line-row__ingredient').length).toBeGreaterThan(0)
  })
})

describe('ingredient line: the last cell holds the actions menu and the remove button', () => {
  it('is a flex row with a gap', () => {
    expect(valueFor('.line-row__remove', 'display', 0)).toBe('flex')
    expect(valueFor('.line-row__remove', 'gap', 0)).toMatch(/^var\(--space-/)
  })
  it('the last track is wide enough for two 40 px buttons plus the gap (>= 84 px) from 672, header and row alike', () => {
    for (const sel of ['.line-row', '.recipe-editor__lines-head']) {
      const cols = valueFor(sel, 'grid-template-columns', 672)!
      const last = Number(/ (\d+)px$/.exec(cols)?.[1])
      expect(last, sel).toBeGreaterThanOrEqual(84)
    }
    expect(valueFor('.line-row', 'grid-template-columns', 672)).toBe(valueFor('.recipe-editor__lines-head', 'grid-template-columns', 672))
  })
})

describe('a pending (Ready Meal) line: the actions sit in column 2 of the two-track grid, on row 1', () => {
  const sel = '.line-row--pending > .line-row__remove'
  it('the override exists and targets an explicit track, not the missing `remove` area', () => {
    expect(rulesFor(sel).length).toBeGreaterThan(0)
    for (const width of [0, 672]) {
      expect(valueFor(sel, 'grid-area', width), `${width}`).toBe('auto')
      expect(valueFor(sel, 'grid-row', width), `${width}`).toBe('1')
      expect(valueFor(sel, 'grid-column', width), `${width}`).toBe('2')
    }
  })
})

describe('a line being dragged or lifted is opaque and floats', () => {
  it("the hairline row has no background, so ['dragging'] and ['lifted'] give it the surface", () => {
    expect(valueFor(".line-row[data-state='dragging']", 'background', 672)).toBe('var(--color-surface)')
    expect(valueFor(".line-row[data-state='lifted']", 'background', 672)).toBe('var(--color-surface)')
  })
  it('and a rounded corner, since the row is square', () => {
    expect(valueFor(".line-row[data-state='dragging']", 'border-radius', 672)).toMatch(/^var\(--radius-/)
  })
})

// B9-37 (RX-02): the number and the handle are the card's lead column (it had a head row before).
describe('Step card: the handle sits under the number in the lead column', () => {
  it('the lead is a centred column grid with a token gap', () => {
    expect(valueFor('.step-card__lead', 'display', 0)).toBe('grid')
    expect(valueFor('.step-card__lead', 'justify-items', 0)).toBe('center')
    expect(valueFor('.step-card__lead', 'gap', 0)).toMatch(/^var\(--space-/)
  })
})

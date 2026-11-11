// Sort-drag: CSS contract of the drag handles in the Recipe editor (jsdom does not lay out; docs/dev/design/sort-drag.md section 6).
import { describe, expect, it } from 'vitest'
import { rulesFor, valueFor } from './rules.test-helper'

describe('ingredient line: the handle lives inside the Ingredient cell, so the grid tracks do not change', () => {
  it('the Ingredient cell is a flex row that lines the handle up with the field, on a phone and from 720', () => {
    expect(valueFor('.line-row__ingredient', 'display', 0)).toBe('flex')
    expect(valueFor('.line-row__ingredient', 'display', 720)).toBe('flex')
    expect(valueFor('.line-row__ingredient', 'align-items', 0)).toMatch(/end/)
    expect(valueFor('.line-row__ingredient', 'gap', 0)).toMatch(/^var\(--space-/)
  })
  it('the handle holder does not shrink and has no label height of its own', () => {
    expect(valueFor('.line-row__handle', 'flex', 0)).toMatch(/^(none|0 0 auto)$/)
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
  it('the last track is wide enough for two 40 px buttons plus the gap (>= 84 px) from 720, header and row alike', () => {
    for (const sel of ['.line-row', '.recipe-editor__lines-head']) {
      const cols = valueFor(sel, 'grid-template-columns', 720)!
      const last = Number(/ (\d+)px$/.exec(cols)?.[1])
      expect(last, sel).toBeGreaterThanOrEqual(84)
    }
    expect(valueFor('.line-row', 'grid-template-columns', 720)).toBe(valueFor('.recipe-editor__lines-head', 'grid-template-columns', 720))
  })
})

describe('a line being dragged or lifted is opaque and floats', () => {
  it("from 720 the hairline row has no background, so ['dragging'] and ['lifted'] give it the surface", () => {
    expect(valueFor(".line-row[data-state='dragging']", 'background', 720)).toBe('var(--color-surface)')
    expect(valueFor(".line-row[data-state='lifted']", 'background', 720)).toBe('var(--color-surface)')
  })
  it('and a rounded corner, since the row is square from 720', () => {
    expect(valueFor(".line-row[data-state='dragging']", 'border-radius', 720)).toMatch(/^var\(--radius-/)
  })
})

describe('Step card: the handle sits at the start of the head', () => {
  it('the head is a flex row that spaces number+handle and the actions', () => {
    expect(valueFor('.step-card__head', 'display', 0)).toBe('flex')
    expect(valueFor('.step-card__head', 'align-items', 0)).toBe('center')
  })
  it('the number and the handle are grouped on the left', () => {
    expect(valueFor('.step-card__lead', 'display', 0)).toBe('flex')
    expect(valueFor('.step-card__lead', 'gap', 0)).toMatch(/^var\(--space-/)
  })
})

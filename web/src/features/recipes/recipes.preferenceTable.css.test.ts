// PT phone contract (rx-pt.md section 5.5): at 360 px the Member column takes what three 48 px state columns leave, a long name
// truncates, nothing scrolls sideways. jsdom does not lay out, so the class names and rules are the contract.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'
import { recipeRules, rulesFor, valueFor } from './rules.test-helper'

const css = readSource('features/recipes/recipes.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('.preference-table on a phone', () => {
  it('fills its Tile and fixes the column widths so the table cannot outgrow it', () => {
    expect(valueFor('.preference-table', 'inline-size', 0)).toBe('100%')
    expect(valueFor('.preference-table', 'table-layout', 0)).toBe('fixed')
    expect(valueFor('.preference-table', 'border-collapse', 0)).toMatch(/collapse/)
  })
  it('gives each state column 48 px at every width', () => {
    for (const w of [0, 360, 768, 1280]) expect(valueFor('.preference-table__state', 'inline-size', w), `@${w}`).toMatch(/^(48px|3rem)$/)
  })
  it('lets the Member column shrink and truncates a long name with an ellipsis', () => {
    expect(valueFor('.preference-table__member', 'min-inline-size', 0)).toBe('0')
    expect(valueFor('.preference-table__name', 'overflow', 0)).toBe('hidden')
    expect(valueFor('.preference-table__name', 'text-overflow', 0)).toBe('ellipsis')
    expect(valueFor('.preference-table__name', 'white-space', 0)).toBe('nowrap')
    expect(valueFor('.preference-table__name', 'min-inline-size', 0)).toBe('0')
  })
  it('centres the state cells so the 44 px buttons sit in their columns', () => {
    expect(valueFor('.preference-table__cell', 'text-align', 0)).toBe('center')
  })
  it('has no sideways scroll container: no overflow-x auto or scroll and no min width in px on the table', () => {
    const own = recipeRules.filter((r) => /preference-table/.test(r.selector))
    expect(own.length).toBeGreaterThan(0)
    for (const r of own) {
      expect(r.body, r.selector).not.toMatch(/overflow(-x)?\s*:\s*(auto|scroll)/)
      expect(r.body, r.selector).not.toMatch(/(?:^|[;\s])min-(inline-size|width)\s*:\s*\d+px/)
    }
  })
  it('highlights the row a link points at, and stops the highlight animating for reduced motion', () => {
    expect(rulesFor(".preference-table tr[data-highlighted='true']").length + rulesFor(".preference-table__row[data-highlighted='true']").length).toBeGreaterThan(0)
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-highlighted/)
  })
  it('has no leftover toggles row from the old Member picker', () => {
    expect(rulesFor('.preference-toggles')).toEqual([])
  })
})

describe('the Avatars on an Ingredient line', () => {
  it('sit in a row that does not wrap or grow the line on a phone', () => {
    expect(valueFor('.ingredient-lines__excluders', 'display', 0)).toMatch(/flex/)
    expect(valueFor('.ingredient-lines__excluders', 'flex-wrap', 0)).toBe('nowrap')
  })
})

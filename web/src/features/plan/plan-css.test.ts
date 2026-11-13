// CSS contract of the Plan (jsdom does not lay out): today's ring, muted Cooked meals, dashed empty rows, dividers.
// ds-plan: the week-grid column rules, the Recipe clamp, the chip-wrapping rules and the slot-head truncation moved to plan.ds.css.test.ts.
import { describe, expect, it } from 'vitest'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css')

const rule = (selector: string) => {
  const start = css.indexOf(selector)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('plan.css', () => {
  it("today's tile gets a 2 px accent ring, not another fill", () => {
    const r = rule(".plan-day[data-today='true']")
    expect(r).toMatch(/2px/)
    expect(r).toMatch(/var\(--color-accent|var\(--accent/)
    expect(r).not.toMatch(/background/)
  })

  // R11b N6 replaces the old "muted to 55 %" rule: dimming by opacity broke WCAG AA (see cookedContrast.test.ts).
  it('Cooked and Not cooked rows are not dimmed with opacity', () => {
    expect(rule(".plan-meal .list-row[data-state='cooked'] .list-row__title")).not.toMatch(/opacity/)
    expect(rule(".plan-meal .list-row[data-state='skipped'] .list-row__title")).not.toMatch(/opacity/)
  })

  it('an unfilled Course is a dashed row', () => {
    expect(rule(".plan-meal .list-row[data-unfilled]")).toMatch(/dashed/)
  })

  it('the divider between meals is a 1 px line and only on a tile flagged data-dividers (3 or more meals)', () => {
    const rules = css.split('}').filter((r) => /\.plan-meal\s*\+\s*\.plan-meal/.test(r))
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) {
      expect(r).toMatch(/\[data-dividers/)
      expect(r).toMatch(/border-top:\s*1px solid/)
    }
  })

  it('does not restyle chips: they keep their own background in narrow tiles', () => {
    expect(css).not.toMatch(/\.chip\s*\{[^}]*(background|color)/)
  })
})

// N2: on a phone the Leftovers tile is half width; two or more rows must stack name over meta, wrap, and never overlap.
describe('plan.css Leftovers tile (N2)', () => {
  it('rows size to their content instead of the fixed 64 px height', () => {
    const r = rule(".plan-leftovers .list-row[data-height]")
    expect(r).toMatch(/block-size:\s*auto/)
    expect(r).toMatch(/min-block-size/)
    expect(r).toMatch(/padding-block/)
  })

  // ds-plan: breaks at word edges only, no hyphenation (word-break guard); the 2-line clamp is ListRow's.
  it('the Recipe name wraps (no nowrap) and breaks at word edges only (no hyphens, no overflow-wrap)', () => {
    const r = rule('.plan-leftovers .list-row__title')
    expect(r).toMatch(/white-space:\s*normal/)
    expect(r).not.toMatch(/overflow-wrap|hyphens|anywhere|nowrap/)
  })

  it('the meta line may wrap under the name', () => {
    expect(rule('.plan-leftovers .list-row__meta')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('the feature stylesheet does not override the ListRow lead: the icon is simply not rendered (see TodayTiles.test)', () => {
    expect(css).not.toMatch(/\.list-row__lead/)
  })

  it('rows have 12 px or more of horizontal padding-free text room: padding-inline is at most space-3', () => {
    expect(rule(".plan-leftovers .list-row[data-height]")).toMatch(/padding-inline:\s*var\(--space-3\)/)
  })
})

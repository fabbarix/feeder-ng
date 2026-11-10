// CSS contract of the Plan (jsdom does not lay out): the week grid, today's ring, muted Cooked meals, the 2-line clamp.
import { describe, expect, it } from 'vitest'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css')

const rule = (selector: string) => {
  const start = css.indexOf(selector)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('plan.css', () => {
  it.each([2, 4, 7])('the week grid has a %i-column rule', (n) => {
    expect(rule(`.plan-grid[data-columns='${n}']`)).toMatch(new RegExp(`grid-template-columns:\\s*repeat\\(${n},\\s*minmax\\(0,\\s*1fr\\)\\)`))
  })

  it("today's tile gets a 2 px accent ring, not another fill", () => {
    const r = rule(".plan-day[data-today='true']")
    expect(r).toMatch(/2px/)
    expect(r).toMatch(/var\(--color-accent|var\(--accent/)
    expect(r).not.toMatch(/background/)
  })

  it('Cooked and Not cooked meals are muted to 55 %', () => {
    expect(rule(".plan-meal[data-state='cooked']")).toMatch(/opacity:\s*0?\.55/)
    expect(rule(".plan-meal[data-state='skipped']")).toMatch(/opacity:\s*0?\.55/)
  })

  it('the Recipe name clamps to two lines', () => {
    expect(rule('.plan-meal__recipe')).toMatch(/-webkit-line-clamp:\s*2/)
  })

  it('an unfilled slot is a dashed block', () => {
    expect(rule(".plan-meal[data-unfilled]")).toMatch(/dashed/)
  })

  it('the divider between meals is a 1 px line and only on a tile flagged data-dividers (3 or more meals)', () => {
    const rules = css.split('}').filter((r) => /\.plan-meal\s*\+\s*\.plan-meal/.test(r))
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) {
      expect(r).toMatch(/\[data-dividers/)
      expect(r).toMatch(/border-top:\s*1px solid/)
    }
  })

  it('chips hug the start of the block instead of stretching (justify-self: start)', () => {
    expect(rule('.plan-meal [data-kind]')).toMatch(/justify-self:\s*start/)
  })

  it('the swap button stays beside the slot label: the head does not wrap, the actions do not shrink, the label truncates', () => {
    const head = rule('.plan-meal__head')
    expect(head).not.toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.plan-meal__actions')).toMatch(/flex:\s*none|flex-shrink:\s*0/)
    const slot = rule('.plan-meal__slot')
    expect(slot).toMatch(/min-width:\s*0/)
    expect(slot).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('no mid-word breaks: nothing uses overflow-wrap: anywhere; Recipe names and chips break at word edges and hyphenate', () => {
    expect(css).not.toMatch(/overflow-wrap:\s*anywhere/)
    for (const sel of ['.plan-meal__recipe', '.plan-meal [data-kind]']) {
      expect(rule(sel)).toMatch(/overflow-wrap:\s*break-word/)
      expect(rule(sel)).toMatch(/hyphens:\s*auto/)
    }
  })

  it('the day title is never clipped: it wraps, with no overflow hidden, ellipsis or nowrap', () => {
    const r = rule('.plan-day__title')
    expect(r).toMatch(/overflow-wrap:\s*break-word/)
    expect(r).not.toMatch(/overflow:\s*hidden|text-overflow|white-space:\s*nowrap/)
  })

  it('does not restyle chips: they keep their own background in narrow tiles', () => {
    expect(css).not.toMatch(/\.chip\b/)
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

  it('the Recipe name wraps (no nowrap, no ellipsis) and breaks long words', () => {
    const r = rule('.plan-leftovers .list-row__title')
    expect(r).toMatch(/white-space:\s*normal/)
    expect(r).toMatch(/overflow-wrap:\s*anywhere/)
    expect(r).not.toMatch(/nowrap/)
  })

  it('the meta line may wrap under the name', () => {
    expect(rule('.plan-leftovers .list-row__meta')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('the 40 px lead icon is dropped (the overline already carries it), freeing the narrow cell', () => {
    expect(rule('.plan-leftovers .list-row__lead')).toMatch(/display:\s*none/)
  })

  it('rows have 12 px or more of horizontal padding-free text room: padding-inline is at most space-3', () => {
    expect(rule(".plan-leftovers .list-row[data-height]")).toMatch(/padding-inline:\s*var\(--space-3\)/)
  })
})

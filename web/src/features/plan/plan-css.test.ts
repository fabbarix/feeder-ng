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

  it('does not restyle chips: they keep their own background in narrow tiles', () => {
    expect(css).not.toMatch(/\.chip\b/)
  })
})

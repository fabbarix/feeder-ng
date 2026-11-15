// B9-32 (PC-11, A11Y-09): the CSS contract of the week grid and of the icon sets on rows. jsdom does not lay out, so the rules are
// pinned in the stylesheet; the real layout is measured by the page-layout scenario plan-grid (scripts/lib/page-layout/scenarios/b9-32.mjs).
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')
const d = (sel: string) => declarations(css, sel)
const bodyOf = (sel: string) => ruleBlocks(css).filter((b) => b.selectors.includes(sel)).map((b) => b.body).join(';')

describe('the week grid: twelve tracks in a size container', () => {
  it('.plan-grid is a size container on its inline axis (the Plan measures it with a ResizeObserver, the CSS can ask it too)', () => {
    expect(d('.plan-grid')['container-type']).toBe('inline-size')
  })

  it('its grid has twelve equal tracks that may shrink: repeat(12, minmax(0, 1fr))', () => {
    expect(bodyOf('.plan-grid > .bento-grid')).toMatch(/grid-template-columns\s*:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/)
  })

  it('the spans are inline (usePlanGrid), so the stylesheet has no nth-child span rule and no 7-column grid', () => {
    expect(css).not.toMatch(/nth-child\([^)]*\)[^{]*\{[^}]*grid-column/)
    expect(css).not.toMatch(/repeat\(7,/)
  })
})

describe('a day that has the whole row lays its Meal Slots side by side', () => {
  it("the day (.plan-day[data-row='true']) is a grid whose Meal Slots are columns, separated by --space-6", () => {
    const b = bodyOf(".plan-day[data-row='true']")
    expect(b).toMatch(/display\s*:\s*grid/)
    expect(b).toMatch(/grid-auto-flow\s*:\s*column|grid-template-columns\s*:\s*repeat\(/)
    expect(b).toMatch(/column-gap\s*:\s*var\(--space-6\)/)
  })

  it('the day title takes the whole first row above the columns', () => {
    expect(bodyOf(".plan-day[data-row='true'] .plan-day__title")).toMatch(/grid-column\s*:\s*1\s*\/\s*-1/)
  })

  it('between two Meal Slots there is a 1 px --color-line divider on the inline side, and no top divider', () => {
    const b = bodyOf(".plan-day[data-row='true'] .plan-meal + .plan-meal")
    expect(b).toMatch(/border-inline-start\s*:\s*1px solid var\(--color-line\)/)
    expect(b).toMatch(/border-top\s*:\s*0|border-block-start\s*:\s*0/)
  })

  it('every column is top-aligned under the one title', () => {
    expect(bodyOf(".plan-day[data-row='true'] .plan-meal")).toMatch(/align-self\s*:\s*start/)
  })
})

describe('A11Y-09: Swap and Pin are an IconSet, and the plan.css has no gap of its own for them', () => {
  it('.plan-row__actions (the old inline-flex group with gap --space-2) is gone: the shared IconSet owns the 8 px gap', () => {
    expect(css).not.toMatch(/\.plan-row__actions\s*\{/)
  })
  it('the slot header actions (Cook, More) use an IconSet too, so no raw gap is declared for them', () => {
    expect(bodyOf('.plan-slot-head__actions')).not.toMatch(/(^|;)\s*gap\s*:/)
  })
})

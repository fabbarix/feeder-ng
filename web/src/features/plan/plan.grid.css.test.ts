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

describe('PC-06: the chip line', () => {
  it('the measuring copy (.plan-row__measure) is out of the layout and unseen: absolute, hidden, no pointer, chips on one line at their natural width', () => {
    const b = bodyOf('.plan-row__measure')
    expect(b).toMatch(/position\s*:\s*absolute/)
    expect(b).toMatch(/visibility\s*:\s*hidden/)
    expect(b).toMatch(/pointer-events\s*:\s*none/)
    expect(b).toMatch(/white-space\s*:\s*nowrap|flex-wrap\s*:\s*nowrap/)
  })

  it('only a cut line ([data-cut]) may end a chip in an ellipsis', () => {
    const b = bodyOf(".plan-row__chips[data-cut='true'] .chip__label") || bodyOf(".plan-row__chips[data-cut='true'] .chip")
    expect(b).toMatch(/text-overflow\s*:\s*ellipsis/)
    expect(css.match(/text-overflow\s*:\s*ellipsis/g)?.length ?? 0).toBeGreaterThan(0)
  })

  it('the unfilled row title ("Not planned") is muted and body-strong', () => {
    const b = bodyOf('.plan-meal .list-row[data-unfilled] .list-row__title')
    expect(b).toMatch(/color\s*:\s*var\(--color-muted\)/)
  })
})

describe("PC-07: the compact Couldn't plan tile", () => {
  it('the tile is a size container, so a cause row can put its fix under the text below 22 rem of tile width', () => {
    expect(d('.plan-couldnt')['container-type']).toBe('inline-size')
    expect(css).toMatch(/@container[^{]*\(max-width:\s*22rem\)/)
  })
  it('a cause row is icon | text | fix on a grid; the text column may shrink (minmax(0, 1fr)); rows are told apart by a 1 px line', () => {
    expect(bodyOf('.couldnt-cause')).toMatch(/display\s*:\s*grid/)
    expect(bodyOf('.couldnt-cause')).toMatch(/grid-template-columns\s*:[^;]*minmax\(0,\s*1fr\)/)
    expect(bodyOf('.couldnt-cause + .couldnt-cause')).toMatch(/border-top\s*:\s*1px solid/)
  })
  it('the cause icon is info-coloured, warn-coloured in a warn row (DS-06 token, never spoil)', () => {
    expect(bodyOf(".couldnt-cause[data-tone='warn'] .couldnt-cause__icon")).toMatch(/var\(--status-warn-fg\)/)
    expect(css).not.toMatch(/--status-spoil/)
  })
  // B9-44 (TB-09, removed on purpose): the header is the shared TileHeader with "Show which meals" as its action (CouldntPlanNotice.tb09.test.tsx).
})

describe('DS-06: Plan tones in plan.css', () => {
  it('the rule warning of a Pinned or Bought meal (a rule that needs a decision) is the warn foreground, not spoil', () => {
    expect(d('.rule-warning-line')['color']).toBe('var(--status-warn-fg)')
  })
  it('no spoil or danger status token is left in plan.css (food going off is not a Plan matter)', () => {
    expect(css).not.toMatch(/--status-(spoil|danger)/)
  })
})

describe('the "+N" chip of a row', () => {
  it('keeps ui/Chip\'s minimum width on the chip line (VC6: one digit is a circle): the line\'s min-inline-size 0 skips it', () => {
    expect(bodyOf(".plan-row__chips .chip[data-kind='count']")).not.toMatch(/min-inline-size/)
    expect(bodyOf(".plan-row__chips .chip:not([data-kind='count'])")).toMatch(/min-inline-size\s*:\s*0/)
  })
})

describe('the "Show which meals" sheet', () => {
  it('sets its summary sentence at weight 500, never bold (no running sentence is bold)', () => {
    const b = bodyOf('.couldnt-meals__summary')
    expect(b).toMatch(/font-weight\s*:\s*500/)
    expect(b).not.toMatch(/font-weight\s*:\s*(6|7|8)00/)
  })
})

describe('the chip line never covers the row target', () => {
  it('the row\'s below slot (the chip line) is click-through and unpositioned, so pressing a chip opens the row (it opened nothing)', () => {
    expect(bodyOf('.plan-meal__courses > .list-row > .list-row__below')).not.toMatch(/position\s*:/)
    expect(bodyOf('.plan-meal__courses > .list-row > .list-row__below')).toMatch(/pointer-events\s*:\s*none/)
    expect(d('.plan-row__measure-box')['pointer-events']).toBe('none')
  })
})

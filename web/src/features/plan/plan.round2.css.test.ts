// ds-plan round 2 (review of the screenshots): the rows must stay inside their tile at 390, 834 and 1024; chips keep their size;
// Recipe names are never cut; rows line up with the header and the title; no raw px or rem left anywhere in plan.css.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')
const d = (sel: string) => declarations(css, sel)
const flat = css.replace(/@[a-z-]+[^{;]*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g, '$1') // media blocks opened up

describe('1. nothing in a day tile can be wider than the tile (the Mon 16 row was 582 px on a 390 phone)', () => {
  it('the Courses list is a one-track grid that may shrink: minmax(0, 1fr)', () => {
    expect(d('.plan-meal__courses')['grid-template-columns']).toBe('minmax(0, 1fr)')
  })

  it('every grid rule of the tile (.plan-day, .plan-meal*, .plan-slot-head, .plan-row*) names its columns', () => {
    const grids = ruleBlocks(flat).filter((b) => b.selectors.some((s) => /^\.plan-(day|meal|slot-head|row)/.test(s)) && /(^|[;\s])display\s*:\s*grid/.test(b.body))
    expect(grids.length).toBeGreaterThan(0)
    for (const g of grids) expect(g.body, g.selectors.join(',')).toMatch(/grid-template-columns\s*:/)
  })

  it('a row and its text can shrink (min-inline-size 0), so a long chip line or name never pushes the row out', () => {
    expect(d('.plan-meal__courses > .list-row')['min-inline-size']).toBe('0')
    expect(d('.plan-meal__courses > .list-row .list-row__text')['min-inline-size']).toBe('0')
  })
})

describe('2. chips keep their full size and the row caps them (lib/rowChips capChips)', () => {
  // round 3: was `flex: none` + max 40 %; superseded by plan.round3.css.test.ts (chips shrink only as a last resort, on a full-width line).
  it('a chip in the row may shrink only when the line is full (flex 0 1 auto); the "+N" chip never does', () => {
    expect(d('.plan-row__chips .chip')['flex']).toBe('0 1 auto')
    expect(d(".plan-row__chips .chip[data-kind='count']")['flex']).toBe('none')
  })

  it('the chip line still clips on one line as a last resort', () => {
    const c = d('.plan-row__chips')
    expect(c['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(c['overflow']).toBe('hidden')
  })
})

describe('3. Recipe names are not cut', () => {
  it('plan.css puts no line-clamp, ellipsis or nowrap on a row title (ListRow data-wrap-title does the wrapping)', () => {
    for (const b of ruleBlocks(flat).filter((r) => r.selectors.some((s) => /list-row__title/.test(s)))) {
      expect(b.body, b.selectors.join(',')).not.toMatch(/line-clamp\s*:\s*[1-9]|text-overflow\s*:\s*ellipsis|white-space\s*:\s*nowrap/)
    }
  })
})

describe('nits: alignment', () => {
  it('Course rows line up with the slot header and the day title: no inline inset of ListRow', () => {
    expect(d('.plan-meal__courses > .list-row')['padding-inline']).toBe('0')
  })

  it('an empty (dashed) row keeps a token inset inside its border', () => {
    expect(d('.plan-meal .list-row[data-unfilled]')['padding-inline']).toBe('var(--space-3)')
  })

  // system.md §3: a row is at least --row-min (64 px) and the design system has no smaller height, so the height is NOT lowered here.
  // What makes a lone row look sparse is centring: content is top-aligned with a small block padding instead.
  it('a row keeps --row-min (the design system floor) but its content is top-aligned with token padding, not centred in empty space', () => {
    const r = d('.plan-meal__courses > .list-row')
    expect(r['min-block-size'] ?? 'var(--row-min)').toBe('var(--row-min)')
    expect(r['align-items']).toBe('flex-start')
    expect(r['padding-block']).toBe('var(--space-2)')
  })

  it('Swap and Pin sit on the title line (top of the row), not centred on the whole row', () => {
    expect(d('.plan-meal__courses > .list-row .list-row__trailing')['align-self']).toBe('flex-start')
  })
})

describe('nits: no raw px or rem anywhere in plan.css (tokens only)', () => {
  const raw = /(^|[\s(,])-?\d*\.?\d+(px|rem)\b/
  const props = /^(gap|row-gap|column-gap|margin(-[a-z]+)*|padding(-[a-z]+)*|top|bottom|left|right|inset(-[a-z]+)*|border-radius|min-block-size|block-size|min-inline-size|inline-size|min-height|height|width)$/

  it('spacing, offsets, radii and sizes use var(--…) or 0; borders and rings may use 1 / 2 / 3 px', () => {
    const bad: string[] = []
    for (const b of ruleBlocks(flat)) {
      for (const decl of b.body.split(';')) {
        const i = decl.indexOf(':')
        if (i < 0) continue
        const prop = decl.slice(0, i).trim()
        const value = decl.slice(i + 1).trim()
        if (props.test(prop) && raw.test(value) && value !== '0') bad.push(`${b.selectors.join(',')} { ${prop}: ${value} }`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the three rules the review named are clean: .plan-meal--not-served, .plan__tile-title, .plan-meal__head', () => {
    expect(d('.plan-meal--not-served')['padding']).toMatch(/^var\(--/)
    expect(d('.plan-meal--not-served')['border-radius']).toMatch(/^var\(--/)
    expect(d('.plan__tile-title')['margin']).not.toMatch(/\d+px/)
    expect(d('.plan-meal__head')['gap'] ?? '').not.toMatch(/\d+px/)
  })
})

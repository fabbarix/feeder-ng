// R2-2 (L-07): Today at desktop widths. From 820 px a 2-column Bento as today; from 1280 px a 3-column Bento where the hero
// spans 2 columns x 2 rows and Use soon, Leftovers and the streak stack beside it. jsdom does not lay out: stylesheet text.
import { describe, expect, it } from 'vitest'
import { readFeatureCss } from './test-css'
import { readSource } from '../plan/test-css'

const css = readFeatureCss('today.css')
const planCss = readFeatureCss('../plan/plan.css')

/** Rule bodies for `selector` inside @media blocks whose condition matches `media`. */
function inMedia(text: string, media: RegExp, selector: string): string[] {
  const out: string[] = []
  const re = /@media\s*([^{]+)\{/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!media.test(m[1] ?? '')) continue
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < text.length && depth > 0) {
      depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0
      i++
    }
    out.push(...text.slice(start, i - 1).split('}').filter((r) => r.includes(selector)))
  }
  return out
}

describe('today.css at desktop widths', () => {
  it('from 1280 px the Today grid has three columns', () => {
    const r = inMedia(css, /min-width:\s*1280px/, '.today').join('\n')
    expect(r).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  })

  it('from 1280 px the grid back-fills (dense) so small tiles sit beside the hero instead of below it', () => {
    const r = inMedia(css, /min-width:\s*1280px/, '.today').join('\n')
    expect(r).toMatch(/grid-auto-flow:\s*row dense|grid-auto-flow:\s*dense/)
  })

  it('from 1280 px the hero spans two columns and two rows', () => {
    const r = inMedia(css, /min-width:\s*1280px/, '.plan-hero').join('\n') + inMedia(css, /min-width:\s*1280px/, "[data-tile='nextMeal']").join('\n')
    expect(r).toMatch(/grid-column:\s*span 2/)
    expect(r).toMatch(/grid-row:\s*span 2/)
  })

  it('wide tiles (Throw out or keep?, To confirm, Couldn\'t plan) still take the full row at three columns', () => {
    const tile = readSource('ui/Tile.css')
    expect(tile).toMatch(/\.tile\[data-span='full'\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })

  it('a hero with no other tile falls back to the full row (no hole in the third column)', () => {
    const r = inMedia(css, /min-width:\s*1280px/, ':only-child').join('\n')
    expect(r).toMatch(/\.plan-hero/)
    expect(r).toMatch(/grid-column:\s*1\s*\/\s*-1/)
  })

  it('the .today container adds no side padding of its own (the Page already has the gutters)', () => {
    const rule = css.slice(css.indexOf('.today {'), css.indexOf('}', css.indexOf('.today {')))
    expect(rule).not.toMatch(/padding:\s*\d+px\s*;/) // a shorthand pads all four sides
    expect(rule).not.toMatch(/padding-inline/)
  })

  it('the hero actions are not restyled here (they live in plan.css, one place)', () => {
    expect(css).not.toMatch(/plan-hero__actions/)
    expect(planCss).toMatch(/plan-hero__actions/)
  })
})

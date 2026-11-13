// R2-2 (L-07), changed by DS-TODAY: Today at desktop widths. jsdom does not lay out: stylesheet text.
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

// DS-TODAY (changed on purpose): the 3-column dense Bento (hero 2x2 beside the small tiles) is gone with the fixed column counts
// (ADR 0016). The hero is always the full row, the tiles below flow by minimum width (BentoGrid min="wide"): 1 column on a
// phone, 2 from about 60 rem of room. These four tests are replaced by the ones below.
describe('today.css at desktop widths', () => {
  it('has no @media (min-width: 1280px) three-column grid, no dense flow and no hero span', () => {
    expect(inMedia(css, /min-width:\s*1280px/, '.today').join('\n')).not.toMatch(/grid-template-columns|grid-auto-flow|span 2/)
    expect(css).not.toMatch(/data-hero-span/)
    expect(css).not.toMatch(/:has\(/)
    expect(css).not.toMatch(/only-child/)
  })

  it('wide tiles (To confirm, Throw out or keep?, Couldn\'t plan) take the full row', () => {
    const tile = readSource('ui/Tile.css')
    expect(tile).toMatch(/\.tile\[data-span='full'\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
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

// R2-2 CSS contracts of the Plan and the Today hero (jsdom does not lay out, so the stylesheet is read as text).
import { describe, expect, it } from 'vitest'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css')
const rules = (selector: string) => css.split('}').filter((r) => r.includes(selector))
/** The rule bodies for `selector` found inside any @media block whose condition matches `media`. */
const inMedia = (media: RegExp, selector: string) => {
  const out: string[] = []
  const re = /@media\s*([^{]+)\{/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (!media.test(m[1] ?? '')) continue
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < css.length && depth > 0) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0, i++
    out.push(...css.slice(start, i - 1).split('}').filter((r) => r.includes(selector)))
  }
  return out
}

// ds-plan: the three "7 columns" rules are gone with the 7-column week (option B: min="day" grid).
describe('plan.css R2-2', () => {
  it('L-05: a day tile never lets a Recipe name or chip spill: tiles in the grid can shrink (min-width 0)', () => {
    expect(rules('.plan-day {').join('')).toMatch(/min-width:\s*0/)
  })

  it('L-07: from 820 px the hero actions sit at the end (right) of the tile, the button keeps its own width', () => {
    const r = inMedia(/min-width:\s*820px/, '.plan-hero__actions').join('')
    expect(r).toMatch(/justify-content:\s*(flex-end|end)/)
  })

  it('L-07: the hero body does not stretch the action row on desktop (no width: 100% on its buttons)', () => {
    expect(rules('.plan-hero__actions .button').join('')).not.toMatch(/width:\s*100%/)
  })
})

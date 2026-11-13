// ds-plan round 3: round 2 made every chip unreadable ("Leftover from Sat" shown as "L…", even alone on a 1024 row). Cause: the chip
// line was only as wide as its content, and `max-inline-size: 40%` is a percentage of THAT width. The fix: the line is as wide as its
// row text (inline-size 100%), chips shrink only when it is really full, and "+N" never shrinks.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')
const d = (sel: string) => declarations(css, sel)

describe('the chip line has room, so a lone chip is never an ellipsis', () => {
  it('.plan-row__chips is as wide as its row text: inline-size 100%', () => {
    expect(d('.plan-row__chips')['inline-size']).toBe('100%')
  })

  it('a chip is flex 0 1 auto with min-inline-size 0: its natural width, shrinking only when the line is full', () => {
    const c = d('.plan-row__chips .chip')
    expect(c['flex']).toBe('0 1 auto')
    expect(c['min-inline-size']).toBe('0')
  })

  it('no percentage max-inline-size on a chip or the chip line (a percentage of a content-sized box is the bug)', () => {
    for (const b of ruleBlocks(css).filter((r) => r.selectors.some((s) => /plan-row__chips|\.chip\b/.test(s)))) {
      expect(b.body, b.selectors.join(',')).not.toMatch(/max-inline-size\s*:\s*[\d.]+%/)
      expect(b.body, b.selectors.join(',')).not.toMatch(/max-width\s*:\s*[\d.]+%/)
    }
  })

  it('the "+N" chip ([data-kind=count]) never shrinks: flex none', () => {
    expect(d(".plan-row__chips .chip[data-kind='count']")['flex']).toBe('none')
  })

  it('the line still clips as a last resort and does not wrap', () => {
    const l = d('.plan-row__chips')
    expect(l['overflow']).toBe('hidden')
    expect(l['flex-wrap'] ?? 'nowrap').toBe('nowrap')
  })
})

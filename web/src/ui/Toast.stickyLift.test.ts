// B9-51 (main-session ruling on toast-over-preferences-bar): on a page shorter than the viewport the sticky action bar ends the form
// above its floating spot, so the toast region, lifted only to the floating spot, covered the bar and its Save (20 px at 390 on
// Preferences). The bar publishes that extra height as --sticky-bar-lift and Toast.css adds it as one more term of the lift, so
// another package's term (--timer-pill-clearance) can be summed beside it.
import { describe, expect, it } from 'vitest'
import { readUiCss, ruleBlocks } from './test-utils'
import { barLift, STICKY_BAR_LIFT } from './useStickyBarClearance'

const css = readUiCss('Toast.css')
const lift = ruleBlocks(css).filter((r) => r.selectors.some((s) => s.includes('.sticky-action-bar') && s.includes('.toast-region')))

describe('Toast.css: the sticky-bar lift has the bar\'s own lift as one more term', () => {
  it('the published property is --sticky-bar-lift', () => expect(STICKY_BAR_LIFT).toBe('--sticky-bar-lift'))
  it('the region\'s lift adds var(--sticky-bar-lift, 0px) to the clearance, inside the one calc() sum', () => {
    expect(lift).toHaveLength(1)
    const bottom = /bottom:\s*([^;]+)/.exec(lift[0]!.body)?.[1] ?? ''
    expect(bottom).toMatch(/^calc\(/)
    expect(bottom).toMatch(/var\(--sticky-bar-clearance\)\s*\+\s*var\(--sticky-bar-lift,\s*0px\)/)
  })
  it('every other lift (B9-25\'s --timer-pill-clearance) is one more term with a 0px fallback, in both region rules, so the terms sum', () => {
    const regions = ruleBlocks(css).filter((r) => r.selectors.some((s) => s.includes('.toast-region')) && /bottom:/.test(r.body))
    expect(regions.length).toBeGreaterThanOrEqual(2)
    for (const r of regions) expect(/bottom:\s*([^;]+)/.exec(r.body)?.[1] ?? '').toMatch(/^calc\(.*\+\s*var\(--timer-pill-clearance,\s*0px\)\s*\+/)
  })
})

describe('barLift (px above the floating spot)', () => {
  // 390 x 844, the bar floats 94 px above the bottom edge (bottom bar 82 + gap 12) and is 70 px tall: its floating top is 680.
  const at = (top: number) => barLift({ viewportHeight: 844, top, bottom: top + 70, stickyBottom: 94 })
  it('is 0 while the bar floats', () => expect(at(680)).toBe(0))
  it('is the distance up to where the bar ends a short form (Preferences at 390: top 644, 36 px)', () => expect(at(644)).toBe(36))
  it('is 0 for a bar below its floating spot, off screen, or leaving the top (a toast at its spot cannot cover it)', () => {
    expect(at(700)).toBe(0)
    expect(at(900)).toBe(0)
    expect(at(-100)).toBe(0)
    expect(at(-20)).toBe(0)
  })
  it('is 0 for a bar so high that the tallest toast fits under it (834 x 1112: the bar at 564, its floating top 948)', () => {
    expect(barLift({ viewportHeight: 1112, top: 564, bottom: 634, stickyBottom: 94 })).toBe(0)
    expect(at(680 - 70 - 160)).toBe(230)
    expect(at(680 - 70 - 161)).toBe(0)
  })
  it('is 0 when the sticky bottom cannot be read (a static bar)', () => expect(barLift({ viewportHeight: 844, top: 600, bottom: 670, stickyBottom: Number.NaN })).toBe(0))
})

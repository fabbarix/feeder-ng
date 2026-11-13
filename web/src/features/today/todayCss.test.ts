// R11b N8, changed by DS-TODAY: the half-width streak tile (".today-streak", align-self: start) is gone. The streak, Leftovers
// and Lines to get are one metric strip that fills its row (today.css .today-metrics; the rest in todayDs.css.test.ts).
import { describe, expect, it } from 'vitest'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('today.css')

describe('today.css metric strip (replaces the N8 streak tile)', () => {
  it('there is no .today-streak (a half tile that hugged its content and left an orphan)', () => {
    expect(css).not.toContain('.today-streak')
  })

  it('the metric strip spans the whole row', () => {
    const start = css.indexOf('.today-metrics')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(css.slice(start, css.indexOf('}', start))).toMatch(/grid-column:\s*1\s*\/\s*-1/)
  })
})

import { describe, expect, it } from 'vitest'
import { streakMetric } from './streak'

// B9-44 (TB-08, changed on purpose): days only, "12 d" (the weeks form "3 wk" is gone, so Today and the board say the same number);
// the accessible name spells the unit out: "12 days", "1 day".
describe('streakMetric', () => {
  it('shows days only, however long the streak', () => {
    expect(streakMetric(12).value).toBe('12 d')
    expect(streakMetric(7).value).toBe('7 d')
    expect(streakMetric(27).value).toBe('27 d')
    expect(streakMetric(1).value).toBe('1 d')
  })

  it('keeps its label', () => {
    expect(streakMetric(5).label).toBe('zero-waste streak')
  })

  it('names itself in full words for assistive technology', () => {
    expect(streakMetric(12).name).toBe('12 days')
    expect(streakMetric(1).name).toBe('1 day')
  })
})

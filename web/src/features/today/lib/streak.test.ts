import { describe, expect, it } from 'vitest'
import { streakMetric } from './streak'

describe('streakMetric', () => {
  it('whole weeks from 7 days on', () => {
    expect(streakMetric(7)).toEqual({ value: '1 wk', label: 'zero-waste streak' })
    expect(streakMetric(21)).toEqual({ value: '3 wk', label: 'zero-waste streak' })
    expect(streakMetric(27)).toEqual({ value: '3 wk', label: 'zero-waste streak' })
  })

  it('days below a week', () => {
    expect(streakMetric(1)).toEqual({ value: '1 d', label: 'zero-waste streak' })
    expect(streakMetric(6)).toEqual({ value: '6 d', label: 'zero-waste streak' })
  })
})

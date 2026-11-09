import { describe, expect, it } from 'vitest'
import { formatMinutes } from './time'

describe('formatMinutes', () => {
  it.each([
    [0, '0 min'],
    [5, '5 min'],
    [40, '40 min'],
    [59, '59 min'],
    [60, '1 h'],
    [65, '1 h 5 min'],
    [240, '4 h'],
    [1380, '23 h'],
    [1440, '1 d'],
    [2880, '2 d'],
    [1500, '25 h'], // not a whole number of days: stays in hours
    [1530, '25 h 30 min'],
  ])('%d minutes -> %s', (minutes, want) => {
    expect(formatMinutes(minutes)).toBe(want)
  })

  it('rounds fractional minutes up and never shows negatives', () => {
    expect(formatMinutes(4.2)).toBe('5 min')
    expect(formatMinutes(-3)).toBe('0 min')
  })
})

import { describe, expect, it } from 'vitest'
import { localDate } from './dates'
import { todayHeading } from './heading'

describe('localDate', () => {
  it('reads the device clock as a YYYY-MM-DD date', () => {
    expect(localDate(new Date(2026, 10, 9, 23, 30))).toBe('2026-11-09')
    expect(localDate(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })

  it('gives a heading that is never "NaN"', () => {
    expect(todayHeading(localDate(new Date(2026, 10, 9)))).toBe('Mon 9 Nov')
  })
})

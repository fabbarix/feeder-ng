import { describe, expect, it } from 'vitest'
import { dateProblem, whosEatingContext } from './attendanceDate'

describe('dateProblem', () => {
  it('accepts a date on the weekday', () => expect(dateProblem(4, '2026-11-12')).toBeNull())
  it('names the weekday it should be', () => expect(dateProblem(4, '2026-11-11')).toBe('2026-11-11 is not a Thursday'))
  it('rejects a date that does not exist', () => expect(dateProblem(4, '2026-02-30')).toMatch(/valid date/))
})

describe('whosEatingContext (B9-38)', () => {
  it('the short weekday, the day and month, then the Meal Slot', () => {
    expect(whosEatingContext('2026-11-12', 'Dinner')).toBe('Thu 12 Nov · Dinner')
    expect(whosEatingContext('2026-12-01', 'Lunch')).toBe('Tue 1 Dec · Lunch')
  })
  it('never prints an ISO date', () => expect(whosEatingContext('2026-11-12', 'Dinner')).not.toMatch(/\d{4}-\d{2}/))
})

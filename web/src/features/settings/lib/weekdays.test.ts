import { describe, expect, it } from 'vitest'
import { nextDateForWeekday, todayIso, weekdayName, WEEKDAYS, weekdayOfDate } from './weekdays'

describe('weekdays', () => {
  it('runs Monday (1) to Sunday (7)', () => {
    expect(WEEKDAYS.map((d) => d.id)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(weekdayName(1)).toBe('Monday')
    expect(weekdayName(7)).toBe('Sunday')
  })

  it.each([
    ['2026-11-09', 1],
    ['2026-11-12', 4],
    ['2026-11-15', 7],
    ['2028-02-29', 2],
  ])('weekdayOfDate(%s) = %s', (date, want) => expect(weekdayOfDate(date)).toBe(want))

  it.each(['', 'nope', '2026-13-01', '2026-02-30', '2026-11-9'])('weekdayOfDate(%j) is null', (date) => {
    expect(weekdayOfDate(date)).toBeNull()
  })

  it('nextDateForWeekday finds the first matching date on or after the start', () => {
    expect(nextDateForWeekday(4, '2026-11-09')).toBe('2026-11-12')
    expect(nextDateForWeekday(4, '2026-11-12')).toBe('2026-11-12')
    expect(nextDateForWeekday(4, '2026-11-13')).toBe('2026-11-19')
    expect(nextDateForWeekday(1, '2026-12-30')).toBe('2027-01-04')
  })
})

describe('todayIso', () => {
  it('formats the local date, zero-padded', () => {
    expect(todayIso(new Date(2026, 10, 9, 23, 30))).toBe('2026-11-09')
    expect(todayIso(new Date(2027, 0, 5, 0, 5))).toBe('2027-01-05')
  })
})

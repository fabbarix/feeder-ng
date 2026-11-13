import { describe, expect, it } from 'vitest'
import { addDays, dateWord, dayDiff, shortDate, weekdayShort } from './dates'

describe('dates', () => {
  it('addDays crosses month and year ends and goes back', () => {
    expect(addDays('2026-11-12', 3)).toBe('2026-11-15')
    expect(addDays('2026-11-12', 90)).toBe('2027-02-10')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('dayDiff is a minus b in whole days', () => {
    expect(dayDiff('2026-11-14', '2026-11-12')).toBe(2)
    expect(dayDiff('2026-11-10', '2026-11-12')).toBe(-2)
    expect(dayDiff('2027-01-01', '2026-12-31')).toBe(1)
  })
  it('names weekdays and dates independent of the time zone', () => {
    expect(weekdayShort('2026-11-10')).toBe('Tue')
    expect(weekdayShort('2026-11-14')).toBe('Sat')
    expect(shortDate('2027-02-10')).toBe('10 Feb')
    expect(shortDate('2026-11-02')).toBe('2 Nov')
  })
  it('dateWord: today, tomorrow, a weekday within six days either way, else the date', () => {
    expect(dateWord('2026-11-12', '2026-11-12')).toBe('today')
    expect(dateWord('2026-11-13', '2026-11-12')).toBe('tomorrow')
    expect(dateWord('2026-11-14', '2026-11-12')).toBe('Sat')
    expect(dateWord('2026-11-10', '2026-11-12')).toBe('Tue')
    expect(dateWord('2026-11-18', '2026-11-12')).toBe('Wed')
    expect(dateWord('2026-11-19', '2026-11-12')).toBe('19 Nov')
    expect(dateWord('2026-11-05', '2026-11-12')).toBe('5 Nov')
  })
})

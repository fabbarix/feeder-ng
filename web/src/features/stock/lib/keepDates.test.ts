// B9-29 (SSP-17, decision SSP 8): "Flour: good until?". The choices of the Change sheet, as pure rules (lib/keepDates.ts, no React).
//   keepChoices(today)            [Today, Tomorrow, In 3 days, In a week], each { id, label, date, dayLabel }; dayLabel "Tue 10 Nov"
//   keepUntilLabel(date)          the primary's words: "Keep until Thu 12 Nov"
//   isKeepDate(date, today)       true when date is a valid ISO day and not before today (the server refuses a past one with 422)
// Today in these tests is Mon 9 Nov 2026 (the household's date from the server).
import { describe, expect, it } from 'vitest'
import { isKeepDate, keepChoices, keepUntilLabel } from './keepDates'

describe('keepChoices', () => {
  it('offers Today, Tomorrow, In 3 days and In a week, each with its date', () => {
    expect(keepChoices('2026-11-09')).toEqual([
      { id: 'today', label: 'Today', date: '2026-11-09', dayLabel: 'Mon 9 Nov' },
      { id: 'tomorrow', label: 'Tomorrow', date: '2026-11-10', dayLabel: 'Tue 10 Nov' },
      { id: 'in3', label: 'In 3 days', date: '2026-11-12', dayLabel: 'Thu 12 Nov' },
      { id: 'week', label: 'In a week', date: '2026-11-16', dayLabel: 'Mon 16 Nov' },
    ])
  })
  it('counts days across a month and a year end', () => {
    const c = keepChoices('2026-12-30')
    expect(c.map((x) => x.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-02', '2027-01-06'])
  })
})

describe('keepUntilLabel', () => {
  it('names the day', () => {
    expect(keepUntilLabel('2026-11-12')).toBe('Keep until Thu 12 Nov')
  })
})

describe('isKeepDate', () => {
  it('accepts today and later, never an earlier day or a malformed one', () => {
    expect(isKeepDate('2026-11-09', '2026-11-09')).toBe(true)
    expect(isKeepDate('2027-01-01', '2026-11-09')).toBe(true)
    expect(isKeepDate('2026-11-08', '2026-11-09')).toBe(false)
    expect(isKeepDate('', '2026-11-09')).toBe(false)
    expect(isKeepDate('not a date', '2026-11-09')).toBe(false)
  })
})

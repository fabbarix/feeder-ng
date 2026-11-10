import { describe, expect, it } from 'vitest'
import { addDays, addMonths, monthMatrix, parseIsoDate, toIsoDate } from './calendar'

describe('iso dates', () => {
  it('parses and formats', () => {
    expect(parseIsoDate('2026-11-10')).toEqual({ year: 2026, month: 11, day: 10 })
    expect(toIsoDate(2026, 3, 4)).toBe('2026-03-04')
    expect(parseIsoDate('2026-02-30')).toBeNull()
    expect(parseIsoDate('nope')).toBeNull()
    expect(parseIsoDate('')).toBeNull()
  })
  it('adds days across month and year ends and leap days', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-11-10', 7)).toBe('2026-11-17')
  })
  it('adds months, clamping the day', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('monthMatrix (weeks start on Monday)', () => {
  it('November 2026 starts on a Sunday: 6 weeks beginning Monday 26 October (30 Nov is a Monday)', () => {
    const weeks = monthMatrix(2026, 11)
    expect(weeks).toHaveLength(6)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0]?.[0]).toEqual({ iso: '2026-10-26', day: 26, inMonth: false })
    expect(weeks[0]?.[6]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true })
    expect(weeks[5]?.[0]).toEqual({ iso: '2026-11-30', day: 30, inMonth: true })
    expect(weeks[5]?.[6]).toEqual({ iso: '2026-12-06', day: 6, inMonth: false })
  })
  it('February 2027 starts on a Monday and needs only 4 weeks', () => {
    const weeks = monthMatrix(2027, 2)
    expect(weeks).toHaveLength(4)
    expect(weeks[0]?.[0]?.iso).toBe('2027-02-01')
    expect(weeks[3]?.[6]?.iso).toBe('2027-02-28')
    expect(weeks.flat().every((d) => d.inMonth)).toBe(true)
  })
  it('can need 6 weeks (August 2026 starts on a Saturday)', () => {
    expect(monthMatrix(2026, 8)).toHaveLength(6)
  })
})

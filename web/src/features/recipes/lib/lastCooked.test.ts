// Beta.5 F7: the "Last cooked" copy (plan 2.7, decided copy). 2026-11-12 is a Thursday.
import { describe, expect, it } from 'vitest'
import { lastCookedLabel, localToday } from './lastCooked'

const today = '2026-11-12'

describe('lastCookedLabel', () => {
  it('says "Not cooked yet" for a Recipe never cooked', () => {
    expect(lastCookedLabel(null, today)).toBe('Not cooked yet')
  })
  it('says today and yesterday', () => {
    expect(lastCookedLabel('2026-11-12', today)).toBe('Last cooked today')
    expect(lastCookedLabel('2026-11-11', today)).toBe('Last cooked yesterday')
  })
  it('names the weekday from 2 to 6 days ago', () => {
    expect(lastCookedLabel('2026-11-10', today)).toBe('Last cooked Tue')
    expect(lastCookedLabel('2026-11-09', today)).toBe('Last cooked Mon')
    expect(lastCookedLabel('2026-11-06', today)).toBe('Last cooked Fri')
  })
  it('gives the day and month from 7 days ago', () => {
    expect(lastCookedLabel('2026-11-05', today)).toBe('Last cooked 5 Nov')
    expect(lastCookedLabel('2026-10-03', today)).toBe('Last cooked 3 Oct')
    expect(lastCookedLabel('2025-12-25', today)).toBe('Last cooked 25 Dec')
  })
  it('counts whole days across a month and a year boundary', () => {
    expect(lastCookedLabel('2026-02-28', '2026-03-02')).toBe('Last cooked Sat')
    expect(lastCookedLabel('2025-12-31', '2026-01-01')).toBe('Last cooked yesterday')
  })
  it('is not thrown by a daylight-saving change between the two dates', () => {
    expect(lastCookedLabel('2026-03-28', '2026-03-30')).toBe('Last cooked Sat')
    expect(lastCookedLabel('2026-10-24', '2026-10-26')).toBe('Last cooked Sat')
  })
  it('reads a date after today (a clock behind the server) as a plain date', () => {
    expect(lastCookedLabel('2026-11-14', today)).toBe('Last cooked 14 Nov')
  })
  it('reads a date as day and month while the household date is not known yet', () => {
    expect(lastCookedLabel('2026-11-10', '')).toBe('Last cooked 10 Nov')
    expect(lastCookedLabel(null, '')).toBe('Not cooked yet')
  })
})

describe('localToday', () => {
  it('is the local calendar date, zero-padded', () => {
    expect(localToday(new Date(2026, 10, 12, 23, 59))).toBe('2026-11-12')
    expect(localToday(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })
})

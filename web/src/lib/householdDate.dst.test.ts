// B9-20 (RES-05), reviewer: the household date around midnight on the days the clocks change, east and west of UTC.
import { describe, expect, it } from 'vitest'
import { todayIn } from './householdDate'

describe('todayIn on a DST day', () => {
  it('Europe/Rome, spring forward (29 Mar 2026): the day starts at 23:00Z and ends at 22:00Z', () => {
    expect(todayIn('Europe/Rome', '2026-03-28T22:59:59Z')).toBe('2026-03-28')
    expect(todayIn('Europe/Rome', '2026-03-28T23:00:00Z')).toBe('2026-03-29')
    expect(todayIn('Europe/Rome', '2026-03-29T21:59:59Z')).toBe('2026-03-29')
    expect(todayIn('Europe/Rome', '2026-03-29T22:00:00Z')).toBe('2026-03-30')
  })
  it('America/New_York, fall back (1 Nov 2026): the day starts at 04:00Z and ends at 05:00Z the next day', () => {
    expect(todayIn('America/New_York', '2026-11-01T03:59:59Z')).toBe('2026-10-31')
    expect(todayIn('America/New_York', '2026-11-01T04:00:00Z')).toBe('2026-11-01')
    expect(todayIn('America/New_York', '2026-11-02T04:59:59Z')).toBe('2026-11-01')
    expect(todayIn('America/New_York', '2026-11-02T05:00:00Z')).toBe('2026-11-02')
  })
  it('Australia/Sydney, spring forward (4 Oct 2026): east of UTC, a day ahead of UTC late in the UTC evening', () => {
    expect(todayIn('Australia/Sydney', '2026-10-03T13:59:59Z')).toBe('2026-10-03')
    expect(todayIn('Australia/Sydney', '2026-10-03T14:00:00Z')).toBe('2026-10-04')
    expect(todayIn('Australia/Sydney', '2026-10-04T12:59:59Z')).toBe('2026-10-04')
    expect(todayIn('Australia/Sydney', '2026-10-04T13:00:00Z')).toBe('2026-10-05')
  })
})

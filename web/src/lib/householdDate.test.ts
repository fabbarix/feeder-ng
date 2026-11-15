import { describe, expect, it } from 'vitest'
import { householdToday, isValidTimeZone, todayIn } from './householdDate'

// B9-20 (RES-05): the Household's date comes from its zone, never from the device.
describe('todayIn', () => {
  it('Pacific/Kiritimati (UTC+14) is already on the 15th at 14:30Z on the 14th', () => {
    expect(todayIn('Pacific/Kiritimati', new Date('2026-11-14T14:30:00Z'))).toBe('2026-11-15')
  })
  it('America/Chicago (UTC−6) is still on the 14th at 03:00Z on the 15th', () => {
    expect(todayIn('America/Chicago', new Date('2026-11-15T03:00:00Z'))).toBe('2026-11-14')
  })
  it('UTC is the UTC date', () => {
    expect(todayIn('UTC', new Date('2026-11-14T23:59:59Z'))).toBe('2026-11-14')
    expect(todayIn('UTC', new Date('2026-11-15T00:00:00Z'))).toBe('2026-11-15')
  })
  it('the day changes at the zone\'s midnight, with the offset of the date (summer time)', () => {
    // Europe/Rome: UTC+2 on 2026-07-01, UTC+1 on 2026-12-01
    expect(todayIn('Europe/Rome', new Date('2026-07-01T21:59:59Z'))).toBe('2026-07-01')
    expect(todayIn('Europe/Rome', new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02')
    expect(todayIn('Europe/Rome', new Date('2026-12-01T22:59:59Z'))).toBe('2026-12-01')
    expect(todayIn('Europe/Rome', new Date('2026-12-01T23:00:00Z'))).toBe('2026-12-02')
  })
  it('accepts a timestamp in milliseconds and an ISO string', () => {
    expect(todayIn('Pacific/Kiritimati', Date.parse('2026-11-14T14:30:00Z'))).toBe('2026-11-15')
    expect(todayIn('Pacific/Kiritimati', '2026-11-14T14:30:00Z')).toBe('2026-11-15')
  })
  it('pads month and day', () => {
    expect(todayIn('UTC', new Date('2026-03-04T10:00:00Z'))).toBe('2026-03-04')
  })
})

describe('householdToday', () => {
  const now = new Date('2026-11-14T14:30:00Z')
  it('is the date in the zone', () => {
    expect(householdToday('Pacific/Kiritimati', now)).toBe('2026-11-15')
  })
  it('is null with no zone, an empty zone or an invalid zone: never the device date', () => {
    expect(householdToday(null, now)).toBeNull()
    expect(householdToday(undefined, now)).toBeNull()
    expect(householdToday('', now)).toBeNull()
    expect(householdToday('Not/AZone', now)).toBeNull()
  })
})

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects the rest', () => {
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Europe/Rome')).toBe(true)
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(5)).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { browserTimeZone, clockIn, isValidTimeZone, needsTimeZoneSetup, timeZoneChanged } from './timezone'

describe('browserTimeZone', () => {
  it('reads the zone from Intl', () => {
    const intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Rome' }) }) } as unknown as typeof Intl
    expect(browserTimeZone(intl)).toBe('Europe/Rome')
  })

  it('falls back to UTC when the browser cannot say', () => {
    const intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({}) }) } as unknown as typeof Intl
    expect(browserTimeZone(intl)).toBe('UTC')
    const throwing = { DateTimeFormat: () => { throw new Error('no') } } as unknown as typeof Intl
    expect(browserTimeZone(throwing)).toBe('UTC')
  })

  it('returns something valid for the real Intl', () => {
    expect(isValidTimeZone(browserTimeZone())).toBe(true)
  })
})

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects nonsense', () => {
    expect(isValidTimeZone('Europe/Rome')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})

describe('needsTimeZoneSetup', () => {
  it('is for an Admin on an unconfigured Household only', () => {
    expect(needsTimeZoneSetup({ timeZoneConfigured: false }, true)).toBe(true)
    expect(needsTimeZoneSetup({ timeZoneConfigured: false }, false)).toBe(false)
    expect(needsTimeZoneSetup({ timeZoneConfigured: true }, true)).toBe(false)
  })
})

describe('clockIn and timeZoneChanged (B9-36, SET-07)', () => {
  it('reads the time of day in the zone, 24 h', () => {
    const at = new Date('2026-11-14T20:14:00Z')
    expect(clockIn('Europe/Rome', at)).toBe('21:14')
    expect(clockIn('UTC', at)).toBe('20:14')
  })
  it('is null for an unknown zone', () => {
    expect(clockIn('Nowhere/Atlantis')).toBeNull()
  })
  it('a chosen zone differs from the stored one', () => {
    expect(timeZoneChanged('Europe/Rome', 'Europe/Rome')).toBe(false)
    expect(timeZoneChanged('Europe/Rome', 'Europe/London')).toBe(true)
  })
})

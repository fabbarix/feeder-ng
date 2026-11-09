import { describe, expect, it } from 'vitest'
import { browserTimeZone, isValidTimeZone, needsTimeZoneSetup } from './timezone'

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

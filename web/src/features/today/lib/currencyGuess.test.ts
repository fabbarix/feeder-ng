// B9-53 (TB-06): the first-run time zone and currency are proposed from the browser. The zone comes from Intl in the page; the currency
// from the locale's region (never from the zone), falling back to USD. Pure functions, no browser APIs read inside.
import { describe, expect, it, vi } from 'vitest'
import { currencyGuess, currencyLabel, regionLabel, zoneRows } from './currencyGuess'

describe('currencyGuess(locale): the currency of the locale\'s region', () => {
  it.each([
    ['it-IT', 'EUR', 'IT'],
    ['en-GB', 'GBP', 'GB'],
    ['en-US', 'USD', 'US'],
    ['fr-CH', 'CHF', 'CH'],
    ['de-DE', 'EUR', 'DE'],
    ['sv-SE', 'SEK', 'SE'],
  ])('%s is %s', (locale, currency, region) => {
    expect(currencyGuess(locale)).toEqual({ currency, region })
  })

  it('a locale with no region falls back to USD and no region ("en", "")', () => {
    expect(currencyGuess('en')).toEqual({ currency: 'USD', region: null })
    expect(currencyGuess('')).toEqual({ currency: 'USD', region: null })
  })

  it('an unknown or malformed locale falls back to USD and never throws', () => {
    expect(currencyGuess('xx-ZZ')).toEqual({ currency: 'USD', region: 'ZZ' })
    expect(currencyGuess('not a locale')).toEqual({ currency: 'USD', region: null })
  })

  it('the region is read from a locale with a script or extensions: zh-Hant-TW is TW (TWD)', () => {
    expect(currencyGuess('zh-Hant-TW')).toEqual({ currency: 'TWD', region: 'TW' })
    expect(currencyGuess('it-IT-u-ca-gregory')).toEqual({ currency: 'EUR', region: 'IT' })
  })
})

describe('labels', () => {
  it('a currency reads "Euro (€)" and "British Pound (£)"', () => {
    expect(currencyLabel('EUR', 'en')).toBe('Euro (€)')
    expect(currencyLabel('GBP', 'en')).toBe('British Pound (£)')
  })

  it('a currency the runtime cannot name reads as its code', () => {
    expect(currencyLabel('ZZZ', 'en')).toBe('ZZZ')
  })

  it('a region reads as its country: "Italy"', () => {
    expect(regionLabel('IT', 'en')).toBe('Italy')
    expect(regionLabel('GB', 'en')).toBe('United Kingdom')
    expect(regionLabel(null, 'en')).toBeNull()
  })
})

describe('zoneRows: the two detected facts of step 1 (R-E rows: key, state, detail)', () => {
  const now = new Date('2026-11-14T14:44:00Z') // 15:44 in Rome

  it('Italy: "Time zone" Europe/Rome, "From this device · 15:44 now", and "Currency" Euro (€), "From Italy"', () => {
    expect(zoneRows({ locale: 'it-IT', timeZone: 'Europe/Rome', now, uiLocale: 'en' })).toEqual([
      { id: 'timeZone', key: 'Time zone', state: 'Europe/Rome', detail: 'From this device · 15:44 now', changeLabel: 'Change time zone' },
      { id: 'currency', key: 'Currency', state: 'Euro (€)', detail: 'From Italy', changeLabel: 'Change currency' },
    ])
  })

  it('the time is the time in THAT zone, in 24-hour form', () => {
    const rows = zoneRows({ locale: 'en-US', timeZone: 'America/New_York', now, uiLocale: 'en' })
    expect(rows[0]!.detail).toBe('From this device · 09:44 now')
  })

  it('a locale with no region has no country to name: the currency detail says it is the default', () => {
    const rows = zoneRows({ locale: 'en', timeZone: 'UTC', now, uiLocale: 'en' })
    expect(rows[1]).toMatchObject({ state: 'US Dollar ($)', detail: 'Default' })
  })

  it('a value the Admin picked with Change (not yet saved) replaces the detected one, and its detail says so', () => {
    const rows = zoneRows({ locale: 'it-IT', timeZone: 'Europe/Rome', now, uiLocale: 'en', chosen: { timeZone: 'Europe/London', currency: 'GBP' } })
    expect(rows[0]).toMatchObject({ state: 'Europe/London', detail: 'Changed by you' })
    expect(rows[1]).toMatchObject({ state: 'British Pound (£)', detail: 'Changed by you' })
  })

  it('every detail is one short line: no sentence, under 40 characters', () => {
    for (const locale of ['it-IT', 'en-GB', 'fr-CH', 'en']) {
      for (const row of zoneRows({ locale, timeZone: 'Europe/Rome', now, uiLocale: 'en' })) expect(row.detail.length).toBeLessThan(40)
    }
  })
})

describe('detectDevice: what the page reads from the browser', () => {
  it('the zone from Intl and the locale from navigator.language, both strings; the zone is never empty', async () => {
    const { detectDevice } = await import('./currencyGuess')
    const d = detectDevice()
    expect(typeof d.timeZone).toBe('string')
    expect(d.timeZone.length).toBeGreaterThan(0)
    expect(d.locale).toBe(navigator.language)
  })

  it('a runtime with no zone falls back to UTC', async () => {
    const { detectDevice } = await import('./currencyGuess')
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: undefined } as never)
    try {
      expect(detectDevice().timeZone).toBe('UTC')
    } finally {
      spy.mockRestore()
    }
  })
})

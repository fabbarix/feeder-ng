// B9-15 (SET-07): the option builders of TimeZoneSelect and CurrencySelect. Options come from Intl.supportedValuesOf, grouped; a static
// list stands in where Intl.supportedValuesOf is missing.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { filterOptions } from './lib'
import { currencyOptions, supportedCurrencies, supportedTimeZones, timeZoneOptions } from './options'

// 2026-11-14 20:14 UTC: Rome (CET, UTC+1) reads 21:14, Kolkata (UTC+5:30) 01:44, New York (EST, UTC-5) 15:14.
const NOW = new Date('2026-11-14T20:14:00Z')
const zones = ['Europe/Rome', 'Europe/London', 'America/New_York', 'America/Argentina/Buenos_Aires', 'Asia/Kolkata', 'UTC']
const byValue = <V extends string | number>(list: { value: V }[], value: V) => list.find((o) => o.value === value)!

describe('timeZoneOptions({ zones, now, deviceZone })', () => {
  const list = timeZoneOptions({ zones, now: NOW, deviceZone: 'Europe/Rome' })
  it('the value is the IANA name, the label is the city, underscores read as spaces and the last path part is the city', () => {
    expect(byValue(list, 'Europe/Rome').label).toBe('Rome')
    expect(byValue(list, 'America/New_York').label).toBe('New York')
    expect(byValue(list, 'America/Argentina/Buenos_Aires').label).toBe('Buenos Aires')
  })
  it('the meta is "<IANA> · UTC+1 · 21:14" (24 hour clock at `now`)', () => {
    expect(byValue(list, 'Europe/Rome').meta).toBe('Europe/Rome · UTC+1 · 21:14')
    expect(byValue(list, 'America/New_York').meta).toBe('America/New_York · UTC-5 · 15:14')
  })
  it('a half-hour zone reads "UTC+5:30"', () => {
    expect(byValue(list, 'Asia/Kolkata').meta).toBe('Asia/Kolkata · UTC+5:30 · 01:44')
  })
  it('the first group is "This device" and holds the device zone', () => {
    expect(list[0]?.group).toBe('This device')
    expect(list[0]?.value).toBe('Europe/Rome')
    expect(list.filter((o) => o.group === 'This device')).toHaveLength(1)
  })
  it('a zone never repeats: the device zone is not listed again under its region', () => {
    expect(list.filter((o) => o.value === 'Europe/Rome')).toHaveLength(1)
  })
  it('the other groups are the regions (the part before the first slash), in order of first appearance after "This device"', () => {
    const groups = [...new Set(list.map((o) => o.group))]
    expect(groups).toEqual(['This device', 'Europe', 'America', 'Asia', 'Other'])
    expect(byValue(list, 'UTC').group).toBe('Other')
  })
  it('without a device zone there is no "This device" group', () => {
    expect(timeZoneOptions({ zones, now: NOW }).some((o) => o.group === 'This device')).toBe(false)
  })
  it('the trigger reads "Rome · Europe/Rome"', () => {
    expect(byValue(list, 'Europe/Rome').triggerLabel).toBe('Rome · Europe/Rome')
  })
  it('the leading visual is a neutral decorative icon', () => {
    const { container } = render(<>{byValue(list, 'Europe/Rome').leading}</>)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
  it('search matches the city, the IANA name and the offset', () => {
    expect(filterOptions(list, 'rom').map((o) => o.value)).toEqual(['Europe/Rome'])
    expect(filterOptions(list, 'Europe/Lon').map((o) => o.value)).toEqual(['Europe/London'])
    expect(filterOptions(list, 'buenos').map((o) => o.value)).toEqual(['America/Argentina/Buenos_Aires'])
    expect(filterOptions(list, 'UTC+5:30').map((o) => o.value)).toEqual(['Asia/Kolkata'])
    expect(filterOptions(list, 'UTC-5').map((o) => o.value)).toContain('America/New_York')
  })
  it('a stored zone that is not in the list is added, so the trigger can show it', () => {
    const withOdd = timeZoneOptions({ zones, now: NOW, include: 'Etc/Weird' })
    expect(byValue(withOdd, 'Etc/Weird')).toBeTruthy()
  })
})

describe('supportedTimeZones', () => {
  it('reads Intl.supportedValuesOf("timeZone")', () => {
    const list = supportedTimeZones({ supportedValuesOf: () => ['Europe/Rome', 'Asia/Tokyo'] })
    expect(list).toEqual(['Europe/Rome', 'Asia/Tokyo'])
  })
  it('falls back to a static list when supportedValuesOf is missing: it has the common zones and UTC', () => {
    const list = supportedTimeZones({})
    expect(list).toEqual(expect.arrayContaining(['Europe/Rome', 'Europe/London', 'America/New_York', 'UTC']))
  })
})

describe('currencyOptions({ codes, locale })', () => {
  const list = currencyOptions({ codes: ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'XOF'], locale: 'en' })
  it('the label is the name (Intl.DisplayNames), the meta "EUR · €"', () => {
    expect(byValue(list, 'EUR').label).toBe('Euro')
    expect(byValue(list, 'EUR').meta).toBe('EUR · €')
    expect(byValue(list, 'USD').label).toBe('US Dollar')
    expect(byValue(list, 'USD').meta).toBe('USD · $')
  })
  it('a currency whose symbol is its code shows the code once', () => {
    expect(byValue(list, 'CHF').meta).toBe('CHF')
  })
  it('groups: "Common" first, then "All currencies"; no currency is in both', () => {
    const groups = [...new Set(list.map((o) => o.group))]
    expect(groups).toEqual(['Common', 'All currencies'])
    expect(byValue(list, 'EUR').group).toBe('Common')
    expect(byValue(list, 'USD').group).toBe('Common')
    expect(byValue(list, 'GBP').group).toBe('Common')
    expect(byValue(list, 'XOF').group).toBe('All currencies')
    expect(new Set(list.map((o) => o.value)).size).toBe(list.length)
  })
  it('All currencies is in alphabetical order of the name', () => {
    const names = list.filter((o) => o.group === 'All currencies').map((o) => o.label)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
  it('search matches the name and the code', () => {
    expect(filterOptions(list, 'euro').map((o) => o.value)).toEqual(['EUR'])
    expect(filterOptions(list, 'chf').map((o) => o.value)).toEqual(['CHF'])
  })
  it('the trigger reads the code with the name: "Euro · EUR"', () => {
    expect(byValue(list, 'EUR').triggerLabel).toBe('Euro · EUR')
  })
  it('a stored code that is not in the list is added', () => {
    expect(byValue(currencyOptions({ codes: ['EUR'], locale: 'en', include: 'XTS' }), 'XTS')).toBeTruthy()
  })
})

describe('supportedCurrencies', () => {
  it('reads Intl.supportedValuesOf("currency")', () => {
    expect(supportedCurrencies({ supportedValuesOf: () => ['EUR', 'USD'] })).toEqual(['EUR', 'USD'])
  })
  it('falls back to a static list with the common currencies', () => {
    expect(supportedCurrencies({})).toEqual(expect.arrayContaining(['EUR', 'USD', 'GBP', 'CHF', 'JPY']))
  })
})

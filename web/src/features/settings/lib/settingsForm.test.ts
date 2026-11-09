import { describe, expect, it } from 'vitest'
import type { HouseholdSettings } from '../types'
import { draftFromSettings, formatLocation, parseLocationInput, settingsFromDraft, validateSettings } from './settingsForm'

const settings: HouseholdSettings = {
  timeZone: 'UTC',
  timeZoneConfigured: false,
  planningHorizonDays: 7,
  defaultCooldownDays: 7,
  defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' },
  plannerStyle: 0.5,
  location: null,
  currency: 'USD',
}

describe('parseLocationInput', () => {
  it('empty text means no Location', () => {
    expect(parseLocationInput('')).toEqual({ ok: true, value: null })
    expect(parseLocationInput('   ')).toEqual({ ok: true, value: null })
  })

  it('text is a city, trimmed', () => {
    expect(parseLocationInput('  Turin ')).toEqual({ ok: true, value: { city: 'Turin' } })
    expect(parseLocationInput('Rio de Janeiro')).toEqual({ ok: true, value: { city: 'Rio de Janeiro' } })
  })

  it.each([
    ['45.07, 7.69', 45.07, 7.69],
    ['45.07,7.69', 45.07, 7.69],
    ['45.07 7.69', 45.07, 7.69],
    ['-33.87, 151.21', -33.87, 151.21],
  ])('%s is coordinates', (text, latitude, longitude) => {
    expect(parseLocationInput(text)).toEqual({ ok: true, value: { latitude, longitude } })
  })

  it.each(['91, 7', '45, 181', '45.07,', '45, 7, 9', '12'])('%s is rejected', (text) => {
    expect(parseLocationInput(text)).toEqual({ ok: false })
  })
})

describe('formatLocation', () => {
  it('round-trips through parseLocationInput', () => {
    expect(formatLocation(null)).toBe('')
    expect(formatLocation({ city: 'Turin' })).toBe('Turin')
    expect(formatLocation({ latitude: 45.07, longitude: 7.69 })).toBe('45.07, 7.69')
    expect(parseLocationInput(formatLocation({ latitude: 45.07, longitude: 7.69 }))).toEqual({ ok: true, value: { latitude: 45.07, longitude: 7.69 } })
  })
})

describe('draftFromSettings', () => {
  it('copies the settings and formats the Location', () => {
    const d = draftFromSettings({ ...settings, timeZoneConfigured: true, timeZone: 'Europe/Rome', location: { city: 'Turin' } })
    expect(d.timeZone).toBe('Europe/Rome')
    expect(d.locationText).toBe('Turin')
    expect(d.planningHorizonDays).toBe(7)
  })

  it('takes the browser suggestion only while the time zone is not configured', () => {
    expect(draftFromSettings(settings, 'Europe/Rome').timeZone).toBe('Europe/Rome')
    expect(draftFromSettings({ ...settings, timeZoneConfigured: true, timeZone: 'Asia/Tokyo' }, 'Europe/Rome').timeZone).toBe('Asia/Tokyo')
  })
})

describe('validateSettings', () => {
  const ok = draftFromSettings(settings, 'Europe/Rome')

  it('accepts the defaults', () => {
    expect(validateSettings(ok)).toEqual({})
  })

  it.each([
    ['planningHorizonDays', { planningHorizonDays: 0 }, /between 1 and 28/],
    ['planningHorizonDays', { planningHorizonDays: 29 }, /between 1 and 28/],
    ['planningHorizonDays', { planningHorizonDays: 7.5 }, /whole/i],
    ['defaultCooldownDays', { defaultCooldownDays: -1 }, /between 0 and 365/],
    ['defaultLeftoverUseByDays', { defaultLeftoverUseByDays: 15 }, /between 1 and 14/],
    ['quietHours', { quietHours: { start: '08:00', end: '08:00' } }, /different/i],
    ['quietHours', { quietHours: { start: '', end: '07:00' } }, /time/i],
    ['currency', { currency: 'EURO' }, /3-letter/i],
    ['timeZone', { timeZone: '' }, /time zone/i],
    ['timeZone', { timeZone: 'Mars/Olympus' }, /time zone/i],
    ['location', { locationText: '91, 7' }, /city or/i],
  ])('flags %s', (field, patch, message) => {
    const errors = validateSettings({ ...ok, ...patch })
    expect(errors[field]).toMatch(message)
  })

  it('accepts the bounds', () => {
    expect(validateSettings({ ...ok, planningHorizonDays: 1 })).toEqual({})
    expect(validateSettings({ ...ok, planningHorizonDays: 28 })).toEqual({})
    expect(validateSettings({ ...ok, currency: 'eur' })).toEqual({})
  })
})

describe('settingsFromDraft', () => {
  it('builds the request body', () => {
    const d = { ...draftFromSettings(settings, 'Europe/Rome'), currency: ' eur ', locationText: '45.07, 7.69', plannerStyle: 0.25 }
    expect(settingsFromDraft(d)).toEqual({
      timeZone: 'Europe/Rome',
      planningHorizonDays: 7,
      defaultCooldownDays: 7,
      defaultLeftoverUseByDays: 3,
      quietHours: { start: '22:00', end: '07:00' },
      plannerStyle: 0.25,
      location: { latitude: 45.07, longitude: 7.69 },
      currency: 'EUR',
    })
  })

  it('sends null for no Location', () => {
    expect(settingsFromDraft(draftFromSettings(settings)).location).toBeNull()
  })
})

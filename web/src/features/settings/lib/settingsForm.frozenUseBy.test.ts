// B5-LOW: the Household's default Frozen Use-by in the settings form model.
import { describe, expect, it } from 'vitest'
import type { HouseholdSettings } from '../types'
import { householdSettings } from '../components/fixtures'
import { draftFromSettings, settingsFromDraft, validateSettings } from './settingsForm'

const settings = { ...householdSettings, frozenUseByDays: 90 } as HouseholdSettings

describe('settings form: Frozen Use-by', () => {
  it('round-trips through the draft', () => {
    const d = draftFromSettings(settings)
    expect(d.frozenUseByDays).toBe(90)
    expect(settingsFromDraft({ ...d, frozenUseByDays: 120 }).frozenUseByDays).toBe(120)
  })
  it.each([0, 366])('rejects %s as out of range', (n) => {
    expect(validateSettings({ ...draftFromSettings(settings), frozenUseByDays: n }).frozenUseByDays).toBe('Default Frozen Use-by must be between 1 and 365.')
  })
  it.each([1.5, Number.NaN])('rejects %s as not whole days', (n) => {
    expect(validateSettings({ ...draftFromSettings(settings), frozenUseByDays: n }).frozenUseByDays).toBe('Default Frozen Use-by must be a whole number of days.')
  })
  it.each([1, 90, 365])('accepts %s', (n) => {
    expect(validateSettings({ ...draftFromSettings(settings), frozenUseByDays: n }).frozenUseByDays).toBeUndefined()
  })
})

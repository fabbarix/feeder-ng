import { isValidTimeZone } from './timezone'
import type { HouseholdLocation, HouseholdSettings, SettingsInput } from '../types'

/** Form state: numbers stay numbers, the Location is free text ("Turin" or "45.07, 7.69"). */
export interface SettingsDraft {
  timeZone: string
  planningHorizonDays: number
  defaultCooldownDays: number
  defaultLeftoverUseByDays: number
  /** Absent when the settings the form was filled from have none: then it is neither checked nor sent (the server keeps its value). */
  frozenUseByDays?: number
  quietHours: { start: string; end: string }
  plannerStyle: number
  locationText: string
  currency: string
}

export type ParsedLocation = { ok: true; value: HouseholdLocation | null } | { ok: false }

const COORDINATES = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/
const NUMERIC_ONLY = /^[-+\d.,\s]+$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** When the time zone was never configured and a suggestion is given, the suggestion wins. */
export function draftFromSettings(s: HouseholdSettings, suggestedTimeZone?: string): SettingsDraft {
  return {
    timeZone: !s.timeZoneConfigured && suggestedTimeZone ? suggestedTimeZone : s.timeZone,
    planningHorizonDays: s.planningHorizonDays,
    defaultCooldownDays: s.defaultCooldownDays,
    defaultLeftoverUseByDays: s.defaultLeftoverUseByDays,
    frozenUseByDays: s.frozenUseByDays,
    quietHours: { ...s.quietHours },
    plannerStyle: s.plannerStyle,
    locationText: formatLocation(s.location),
    currency: s.currency,
  }
}

/** Empty text = no Location; "lat, lon" or "lat lon" = coordinates (-90..90, -180..180); other text = a city. */
export function parseLocationInput(text: string): ParsedLocation {
  const t = text.trim()
  if (t === '') return { ok: true, value: null }
  if (NUMERIC_ONLY.test(t)) {
    const m = COORDINATES.exec(t)
    if (!m) return { ok: false }
    const latitude = Number(m[1])
    const longitude = Number(m[2])
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { ok: false }
    return { ok: true, value: { latitude, longitude } }
  }
  return { ok: true, value: { city: t } }
}

export function formatLocation(loc: HouseholdLocation | null): string {
  if (!loc) return ''
  return 'city' in loc ? loc.city : `${loc.latitude}, ${loc.longitude}`
}

/** An error message for a whole-number day count, or undefined when it is fine. */
function dayCountError(label: string, n: number, min: number, max: number): string | undefined {
  if (!Number.isInteger(n)) return `${label} must be a whole number of days.`
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`
  return undefined
}

/** Field name -> message. Empty when valid. Keys: timeZone, planningHorizonDays, defaultCooldownDays,
 *  defaultLeftoverUseByDays, quietHours, currency, location. */
export function validateSettings(d: SettingsDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!isValidTimeZone(d.timeZone)) errors.timeZone = 'Choose a valid time zone, for example Europe/Rome.'
  const horizon = dayCountError('Planning Horizon', d.planningHorizonDays, 1, 28)
  if (horizon) errors.planningHorizonDays = horizon
  const cooldown = dayCountError('Default Cool-down', d.defaultCooldownDays, 0, 365)
  if (cooldown) errors.defaultCooldownDays = cooldown
  const useBy = dayCountError('Default Leftover Use-by', d.defaultLeftoverUseByDays, 1, 14)
  if (useBy) errors.defaultLeftoverUseByDays = useBy
  if (d.frozenUseByDays !== undefined) {
    const frozenUseBy = dayCountError('Default Frozen Use-by', d.frozenUseByDays, 1, 365)
    if (frozenUseBy) errors.frozenUseByDays = frozenUseBy
  }
  const { start, end } = d.quietHours
  if (!TIME.test(start) || !TIME.test(end)) errors.quietHours = 'Enter a start and end time.'
  else if (start === end) errors.quietHours = 'Start and end must be different times.'
  if (!/^[A-Za-z]{3}$/.test(d.currency.trim())) errors.currency = 'Use a 3-letter currency code, for example EUR.'
  if (!parseLocationInput(d.locationText).ok) errors.location = 'Enter a city or coordinates such as 45.07, 7.69.'
  return errors
}

/** The request body for a valid draft: currency upper-cased and trimmed, Location parsed. */
export function settingsFromDraft(d: SettingsDraft): SettingsInput {
  const parsed = parseLocationInput(d.locationText)
  return {
    timeZone: d.timeZone,
    planningHorizonDays: d.planningHorizonDays,
    defaultCooldownDays: d.defaultCooldownDays,
    defaultLeftoverUseByDays: d.defaultLeftoverUseByDays,
    frozenUseByDays: d.frozenUseByDays,
    quietHours: { ...d.quietHours },
    plannerStyle: d.plannerStyle,
    location: parsed.ok ? parsed.value : null,
    currency: d.currency.trim().toUpperCase(),
  }
}

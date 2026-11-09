import type { HouseholdLocation, HouseholdSettings, SettingsInput } from '../types'

/** Form state: numbers stay numbers, the Location is free text ("Turin" or "45.07, 7.69"). */
export interface SettingsDraft {
  timeZone: string
  planningHorizonDays: number
  defaultCooldownDays: number
  defaultLeftoverUseByDays: number
  quietHours: { start: string; end: string }
  plannerStyle: number
  locationText: string
  currency: string
}

export type ParsedLocation = { ok: true; value: HouseholdLocation | null } | { ok: false }

/** When the time zone was never configured and a suggestion is given, the suggestion wins. */
export function draftFromSettings(_s: HouseholdSettings, _suggestedTimeZone?: string): SettingsDraft {
  throw new Error('not implemented')
}

/** Empty text = no Location; "lat, lon" or "lat lon" = coordinates (-90..90, -180..180); other text = a city. */
export function parseLocationInput(_text: string): ParsedLocation {
  throw new Error('not implemented')
}

export function formatLocation(_loc: HouseholdLocation | null): string {
  throw new Error('not implemented')
}

/** Field name -> message. Empty when valid. Keys: timeZone, planningHorizonDays, defaultCooldownDays,
 *  defaultLeftoverUseByDays, quietHours, currency, location. */
export function validateSettings(_d: SettingsDraft): Record<string, string> {
  throw new Error('not implemented')
}

/** The request body for a valid draft: currency upper-cased and trimmed, Location parsed. */
export function settingsFromDraft(_d: SettingsDraft): SettingsInput {
  throw new Error('not implemented')
}

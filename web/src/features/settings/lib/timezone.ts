import type { HouseholdSettings } from '../types'

/** The browser's IANA zone, or "UTC" when it cannot tell. */
export function browserTimeZone(intl: Pick<typeof Intl, 'DateTimeFormat'> = Intl): string {
  try {
    return intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isValidTimeZone(name: string): boolean {
  if (!name) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name })
    return true
  } catch {
    return false
  }
}

/** True for an Admin when the Household's time zone has never been set. */
export function needsTimeZoneSetup(s: Pick<HouseholdSettings, 'timeZoneConfigured'>, isAdmin: boolean): boolean {
  return isAdmin && !s.timeZoneConfigured
}

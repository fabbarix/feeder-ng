import type { HouseholdSettings } from '../types'

/** The browser's IANA zone, or "UTC" when it cannot tell. */
export function browserTimeZone(_intl?: Pick<typeof Intl, 'DateTimeFormat'>): string {
  throw new Error('not implemented')
}

export function isValidTimeZone(_name: string): boolean {
  throw new Error('not implemented')
}

/** True for an Admin when the Household's time zone has never been set. */
export function needsTimeZoneSetup(_s: Pick<HouseholdSettings, 'timeZoneConfigured'>, _isAdmin: boolean): boolean {
  throw new Error('not implemented')
}

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

/** B9-36 (SET-07): the time of day in `zone` at `now`, "HH:MM" (24 h); null when the zone is unknown. */
export function clockIn(zone: string, now: Date = new Date()): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    const hour = parts.find((p) => p.type === 'hour')?.value
    const minute = parts.find((p) => p.type === 'minute')?.value
    return hour && minute ? `${hour}:${minute}` : null
  } catch {
    return null
  }
}

/** B9-36 (SET-07): a changed time zone can move today's meals, so the form says so whenever the choice differs from the stored zone. */
export function timeZoneChanged(stored: string, chosen: string): boolean {
  return stored !== chosen
}

// B9-20 (RES-05): the Household's date, from the zone /api/me gives or the remembered one: known from the first frame
// when a zone was ever seen, and null (never the device date) on a first launch.
import { householdToday } from '../lib/householdDate'
import { readCachedTimeZone } from './meCache'
import { useMe } from './useMe'

export function useHouseholdDate(now?: () => Date): string | null {
  const me = useMe()
  const zone = me.data?.householdTimeZone ?? readCachedTimeZone()
  return householdToday(zone, now ? now() : Date.now())
}

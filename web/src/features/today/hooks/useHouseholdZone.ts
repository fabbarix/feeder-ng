// B9-44 (TB-02): the Household's IANA zone (from /api/me, else the remembered one), for the When badges of Advance Steps; null when
// it was never seen.
import { readCachedTimeZone } from '../../../app/meCache'
import { useMe } from '../../../app/useMe'

export function useHouseholdZone(): string | null {
  const me = useMe()
  return me.data?.householdTimeZone ?? readCachedTimeZone() ?? null
}

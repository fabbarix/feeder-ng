// B9-20 (RES-05): the Household's date, from the zone /api/me gives or the remembered one: known from the first frame
// when a zone was ever seen, and null (never the device date) on a first launch.
// B9-44 (RES-05): Today stays open past midnight, so the hook re-renders when the Household's day changes: one timer to the next
// change of date in its zone, and a check when the tab becomes visible again (timers sleep with the device).
import { useEffect, useReducer } from 'react'
import { householdToday } from '../lib/householdDate'
import { readCachedTimeZone } from './meCache'
import { useMe } from './useMe'

/** The longest a single timer waits; the date is checked again then (so a far midnight or a clock change is never missed for long). */
const MAX_WAIT_MS = 6 * 3_600_000

/** Milliseconds from `at` until the Household's date in `zone` changes (to the minute, then exact by search). */
export function msToNextHouseholdDay(zone: string, at: number): number {
  const day = householdToday(zone, at)
  // Find the first instant within the next ~26 h whose date differs: step by an hour, then by a minute, then by a second.
  let lo = at
  let step = 3_600_000
  let probe = at + step
  while (probe - at < 27 * 3_600_000 && householdToday(zone, probe) === day) {
    lo = probe
    probe += step
  }
  for (step of [60_000, 1_000]) {
    let t = lo
    while (t + step < probe && householdToday(zone, t + step) === day) t += step
    lo = t
    probe = Math.min(probe, t + step)
  }
  return Math.max(1_000, probe - at)
}

export function useHouseholdDate(now?: () => Date): string | null {
  const me = useMe()
  const zone = me.data?.householdTimeZone ?? readCachedTimeZone()
  const date = householdToday(zone, now ? now() : Date.now())
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const live = !now && date !== null && zone
  useEffect(() => {
    if (!live) return
    const zoneName = zone as string
    const wait = Math.min(MAX_WAIT_MS, msToNextHouseholdDay(zoneName, Date.now()))
    const timer = setTimeout(tick, wait)
    const onVisible = () => {
      if (document.visibilityState !== 'hidden' && householdToday(zoneName, Date.now()) !== date) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [live, zone, date])
  return date
}

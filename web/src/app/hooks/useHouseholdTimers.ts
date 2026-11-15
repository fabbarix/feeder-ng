// The shell's view of the household's timers (PC-04). STUB: the developer replaces it (tests in useHouseholdTimers.test.tsx).
import type { AlarmAdapter } from '../../features/cook/adapters/alarm'
import type { ShellTimer } from '../../features/cook/lib/householdTimers'

export interface HouseholdTimers {
  head: ShellTimer | null
  more: number
  /** The seconds the pill's accessible name says: refreshed once a minute. */
  nameSeconds: number
  all: ShellTimer[]
  finished: ShellTimer[]
  ringing: boolean
  /** Dismisses the finished timers (cancels each on the server). */
  dismissFinished(): Promise<void>
}
export interface UseHouseholdTimersOptions {
  now?: () => number
  tickMs?: number
  pollMs?: number
  alarm?: AlarmAdapter
}
export const EMPTY_HOUSEHOLD_TIMERS: HouseholdTimers = { head: null, more: 0, nameSeconds: 0, all: [], finished: [], ringing: false, dismissFinished: async () => {} }
export function useHouseholdTimers(_opts: UseHouseholdTimersOptions = {}): HouseholdTimers {
  return EMPTY_HOUSEHOLD_TIMERS
}

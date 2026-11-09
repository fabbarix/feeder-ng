import type { CookTimer, StartTimerInput } from '../types'

export interface TimerItem {
  timer: CookTimer
  /** Whole seconds left right now, corrected for clock skew. */
  seconds: number
}

export interface UseTimers {
  /** Sorted with lib/timers.sortTimers. */
  items: TimerItem[]
  isLoading: boolean
  start(input: StartTimerInput): Promise<CookTimer>
  pause(id: number): Promise<void>
  resume(id: number): Promise<void>
  cancel(id: number): Promise<void>
}

export interface UseTimersOptions {
  /** Device clock in ms; tests inject one. Default Date.now. */
  now?: () => number
  /** How often the countdown re-renders; default 1000 ms. */
  tickMs?: number
}

/**
 * The synced timers (all of them, or one scope's). react-query ['cook','timers',scope]
 * fed by GET /api/cook/timers; refetches on SSE topic `timers` and on reconnect.
 * Skew between the device and the server clock is measured from each response's
 * `now` and applied to the countdown. Actions call the API, then refetch.
 */
export function useTimers(_scope?: string, _opts?: UseTimersOptions): UseTimers {
  throw new Error('TODO')
}

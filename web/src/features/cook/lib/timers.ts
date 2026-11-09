// Pure helpers for synced timers. Plain TypeScript, no React.
import type { CookTimer } from '../types'

/**
 * serverNow - clientNow in ms, measured from a response's `now`. Add it to the
 * device clock to get server time, so a drifting tablet still agrees with the phone.
 */
export function measureSkew(_serverNow: string, _clientNowMs: number): number {
  throw new Error('TODO')
}

/**
 * Whole seconds left, rounded up and never negative. Running timers count down
 * to endsAt using clientNowMs + skewMs; paused ones show remainingSeconds as
 * sent; finished ones 0.
 */
export function remainingSeconds(_timer: CookTimer, _clientNowMs: number, _skewMs: number): number {
  throw new Error('TODO')
}

/** Running by soonest end, then paused by label, then finished by id. Does not mutate. */
export function sortTimers(_timers: CookTimer[], _clientNowMs: number, _skewMs: number): CookTimer[] {
  throw new Error('TODO')
}

/** Ids of the timers that count as finished: state finished, or running and already past endsAt. */
export function finishedIds(_timers: CookTimer[], _clientNowMs: number, _skewMs: number): number[] {
  throw new Error('TODO')
}

/** Ids in `now` that are finished and were not finished in `before` (a timer first seen already finished is not new). */
export function newlyFinished(_before: number[] | null, _now: number[]): number[] {
  throw new Error('TODO')
}

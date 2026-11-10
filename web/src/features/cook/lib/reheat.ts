// Reheat: pure helpers for the reheating timer of a Planned Meal served from a Leftover. Plain TypeScript, no React.
// Design: docs/dev/design/r12-reheat.md. R12 STUB: the developer implements these; the tests in reheat.test.ts are red.
import type { SlotKey } from '../../plan/types'
import type { CookTimer } from '../types'

/** Label of the reheating timer. */
export const REHEAT_LABEL = 'Reheat'
/** Shortest and longest reheating timer, and the step of the +/- control (seconds). */
export const REHEAT_MIN_SECONDS = 30
export const REHEAT_MAX_SECONDS = 30 * 60
export const REHEAT_STEP_SECONDS = 30

/** The default reheating time for a Planned Meal of `portions` Leftover portions. */
export function defaultReheatSeconds(_portions: number): number {
  throw new Error('R12: defaultReheatSeconds is not implemented')
}

/** `current` moved by `delta` seconds, kept within REHEAT_MIN_SECONDS..REHEAT_MAX_SECONDS. */
export function adjustReheatSeconds(_current: number, _delta: number): number {
  throw new Error('R12: adjustReheatSeconds is not implemented')
}

/** The reheating timer of a Planned Meal's scope: a free timer (no Step) labelled REHEAT_LABEL, in any state; else null. */
export function reheatTimerOf(_timers: CookTimer[], _scope: string): CookTimer | null {
  throw new Error('R12: reheatTimerOf is not implemented')
}

/** The route of the Reheat screen of a Planned Meal: `/cook/reheat/<date>/<mealSlotId>`. */
export function cookReheatPath(_key: SlotKey): string {
  throw new Error('R12: cookReheatPath is not implemented')
}

// Reheat: pure helpers for the reheating timer of a Planned Meal served from a Leftover. Plain TypeScript, no React.
// Design: docs/dev/design/r12-reheat.md.
import type { SlotKey } from '../../plan/types'
import type { CookTimer } from '../types'

/** Label of the reheating timer. */
export const REHEAT_LABEL = 'Reheat'
/** Shortest and longest reheating timer, and the step of the +/- control (seconds). */
export const REHEAT_MIN_SECONDS = 30
export const REHEAT_MAX_SECONDS = 30 * 60
export const REHEAT_STEP_SECONDS = 30

const BASE_SECONDS = 120
const PER_PORTION_SECONDS = 60
const DEFAULT_CAP_SECONDS = 600

/** The default reheating time for a Planned Meal of `portions` Leftover portions. */
// TODO(developer, R12): when `reheatMinutes` (the Recipe's own reheat time, 1 to 30) is a usable number, return reheatMinutes * 60.
export function defaultReheatSeconds(portions: number, _reheatMinutes?: number | null): number {
  if (!Number.isFinite(portions) || portions < 1) return BASE_SECONDS
  const extra = Math.ceil(portions) - 1
  return Math.min(DEFAULT_CAP_SECONDS, BASE_SECONDS + extra * PER_PORTION_SECONDS)
}

/** `current` moved by `delta` seconds, kept within REHEAT_MIN_SECONDS..REHEAT_MAX_SECONDS. */
export function adjustReheatSeconds(current: number, delta: number): number {
  return Math.min(REHEAT_MAX_SECONDS, Math.max(REHEAT_MIN_SECONDS, current + delta))
}

/** The reheating timer of a Planned Meal's scope: a free timer (no Step) labelled REHEAT_LABEL, in any state; else null. */
export function reheatTimerOf(timers: CookTimer[], scope: string): CookTimer | null {
  return timers.find((t) => t.scope === scope && t.step === null && t.label === REHEAT_LABEL) ?? null
}

/** The route of the Reheat screen of a Planned Meal: `/cook/reheat/<date>/<mealSlotId>`. */
export function cookReheatPath(key: SlotKey): string {
  return `/cook/reheat/${key.date}/${key.mealSlotId}`
}

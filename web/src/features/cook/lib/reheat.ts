// Reheat: pure helpers for the reheating timer of a Planned Meal served from a Leftover. Plain TypeScript, no React.
// Design: docs/dev/design/r12-reheat.md.
import type { LeftoverSource, SlotKey } from '../../plan/types'
import { formatPortions } from '../../plan/lib/cook'
import { weekdayName } from '../../plan/lib/phrase'
import type { CookTimer } from '../types'
import { sameScope } from './scope'

/** Label of the reheating timer. */
export const REHEAT_LABEL = 'Reheat'
/** Shortest and longest reheating timer, and the step of the +/- control (seconds). */
export const REHEAT_MIN_SECONDS = 30
export const REHEAT_MAX_SECONDS = 30 * 60
export const REHEAT_STEP_SECONDS = 30

const BASE_SECONDS = 120
const PER_PORTION_SECONDS = 60
const DEFAULT_CAP_SECONDS = 600

/** The default reheating time: the Recipe's own `reheatMinutes` when usable (flat, not scaled), else the formula for `portions` Leftover portions. */
export function defaultReheatSeconds(portions: number, reheatMinutes?: number | null): number {
  if (typeof reheatMinutes === 'number' && Number.isFinite(reheatMinutes) && reheatMinutes > 0) {
    return Math.min(REHEAT_MAX_SECONDS, Math.max(REHEAT_MIN_SECONDS, reheatMinutes * 60))
  }
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

/** The route of the Reheat screen of a Planned Meal: `/cook/reheat/<date>/<mealSlotId>/<courseId>`. A key without its Course has no route (throws). */
export function cookReheatPath(key: SlotKey): string {
  if (!Number.isInteger(key.courseId)) throw new Error('a Reheat route needs its Course')
  return `/cook/reheat/${key.date}/${key.mealSlotId}/${key.courseId}`
}

/**
 * The reheating timer of a Course's scope through `sameScope`, so the Reheat item of the cooking timeline and the Reheat
 * screen find the same timer. Every Course, the main one included, has its three-part scope (crs-c3).
 */
export function reheatTimerOfCourse(timers: CookTimer[], scope: string): CookTimer | null {
  return timers.find((t) => t.step === null && t.label === REHEAT_LABEL && sameScope(t.scope, scope)) ?? null
}

/** A Meal Slot's name and time, as the Plan sends them. */
export interface SlotLabel {
  date: string
  mealSlotId: number
  name: string
  time: string
}

/**
 * B9-40 (PC-15): the Reheat tile's overline "Leftover from Mon Dinner" and meta "2.75 portions · Tue Dinner 19:00". A Meal Slot has
 * the same name on every date, so the source's name is found by its mealSlotId in any slot of the Plan; unknown, the day alone.
 */
export function reheatLines(portions: number, source: LeftoverSource | null, slot: SlotLabel | null, slots: SlotLabel[]): { overline: string; meta: string } {
  const sourceName = source ? (slots.find((x) => x.mealSlotId === source.mealSlotId)?.name ?? '') : ''
  const overline = source ? `Leftover from ${[weekdayName(source.date, 'short'), sourceName].filter(Boolean).join(' ')}` : REHEAT_LABEL
  const when = slot ? [weekdayName(slot.date, 'short'), slot.name, slot.time].filter(Boolean).join(' ') : ''
  return { overline, meta: [formatPortions(portions), when].filter(Boolean).join(' · ') }
}

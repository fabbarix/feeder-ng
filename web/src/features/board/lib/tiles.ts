// Pure helpers behind the kitchen board's tiles. Plain TypeScript, no React.
import type { LeftoverLike, SlotLike, StockTotalLike } from '../types'

/**
 * Tonight's Planned Meal: of today's slots (date === today) that have a meal
 * in state planned, the first whose `at` is not before nowIso minus 2 hours
 * (a meal that started less than 2 h ago is still tonight's); if all are
 * earlier, none. Sorted by `at`, then mealSlotId. Null when nothing qualifies.
 */
export function tonightMeal(_slots: SlotLike[], _today: string, _nowIso: string): SlotLike | null {
  throw new Error('TODO')
}

/** The Planned Meals (state planned) of the day after `today`, by `at` then mealSlotId. */
export function tomorrowMeals(_slots: SlotLike[], _today: string): SlotLike[] {
  throw new Error('TODO')
}

export interface LeftoverRow {
  id: number
  recipeName: string
  portions: number
  useBy: string
}

/** Leftovers with portions > 0, soonest Use-by first (then by recipe name), at most `max`. */
export function leftoverRows(_leftovers: LeftoverLike[], _max: number): LeftoverRow[] {
  throw new Error('TODO')
}

/** Ingredients flagged useSoon (never spoiled ones: spoiledCount > 0 with no useSoon flag are left out), soonest go-off first then name, at most `max`. */
export function useSoonRows(_totals: StockTotalLike[], _max: number): StockTotalLike[] {
  throw new Error('TODO')
}

/** "18:42" in 24-hour time in the given IANA zone. */
export function clockText(_now: Date, _timeZone: string): string {
  throw new Error('TODO')
}

/** "Monday 9 November" style long date in the zone, English. */
export function dateText(_now: Date, _timeZone: string): string {
  throw new Error('TODO')
}

/** Milliseconds from now until nextChangeAt, never negative, capped at 24 h (so a bad value cannot sleep forever). */
export function msUntil(_nextChangeAt: string, _nowMs: number): number {
  throw new Error('TODO')
}

/** "in 3 h", "in 45 min", "now" (due within a minute or overdue): how soon an Advance Step must start. */
export function dueText(_dueAt: string, _nowMs: number): string {
  throw new Error('TODO')
}

/**
 * Where the big "Start Cook Mode" button goes: tonight's meal, else the next
 * planned meal from now on (any day, `at` not before now), else null (the
 * button is disabled). Returns the path "/cook/meal/<date>/<mealSlotId>".
 */
export function startCookPath(_slots: SlotLike[], _today: string, _nowIso: string): string | null {
  throw new Error('TODO')
}

// SET-15: the Removed Meal Slots tile's rows. Pure functions, no React. Stub: the developer implements it (B9-42).

/** One answer row of `GET /api/meal-slots?removed=with-history`: a name removed on several weekdays at once is one row. */
export interface RemovedMealSlotGroup {
  ids: number[]
  name: string
  /** ISO weekdays 1..7, ascending. */
  weekdays: number[]
  time: string
  /** ISO timestamp of the removal. */
  removedAt: string
  cookedCount: number
  notCookedCount: number
}

/** How the history is counted. OPEN PRODUCT QUESTION (B9-42): apart ("12 Cooked · 3 Not cooked") or one number. Pinned "apart" until the user decides. */
export type HistoryStyle = 'apart' | 'combined'
export const HISTORY_STYLE: HistoryStyle = 'apart'

export interface RemovedRow {
  /** The ids joined with "-": a stable React key. */
  key: string
  ids: number[]
  name: string
  /** "Snack · Mon to Fri". */
  title: string
  /** "16:30 · removed 14 Nov". */
  detail: string
  /** The row's value, from `historyLabel`. */
  value: string
  /** "Put back Snack · Mon to Fri". */
  putBackLabel: string
}

export function historyLabel(_counts: { cookedCount: number; notCookedCount: number }, _style: HistoryStyle = HISTORY_STYLE): string {
  throw new Error('not implemented')
}

export function removedDaysLabel(_weekdays: readonly number[], _locale = 'en'): string {
  throw new Error('not implemented')
}

export function removedMealSlotRows(_groups: readonly RemovedMealSlotGroup[], _locale = 'en'): RemovedRow[] {
  throw new Error('not implemented')
}

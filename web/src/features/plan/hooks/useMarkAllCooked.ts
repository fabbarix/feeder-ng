// CRS F: the state of the Mark all Cooked sheet (Plan, Today and the end of the cooking timeline). STUB (inert).
import type { AllCookedRow } from '../lib/toConfirm'
import type { CookedAllResult, SlotKey, StockWarning } from '../types'

export interface MarkAllCookedController {
  /** One row per Course in `courseIds`, in that order, from GET .../{courseId}/cook; empty until every preview has loaded. */
  rows: AllCookedRow[]
  isLoading: boolean
  /** Sets one fresh Course's Leftover (clamped to 0..maxLeftover; a Leftover Course is ignored). */
  setLeftover: (courseId: number, portions: number) => void
  /** POST .../all/cooked with lib/toConfirm allCookedBody(rows); resolves the result, or null on failure with `error` set. Refetches ['plan']. */
  confirm: () => Promise<CookedAllResult | null>
  busy: boolean
  error: string | null
  result: CookedAllResult | null
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
}

const NONE: never[] = []

/** Idle (no request) while `slot` is null. `slot` is `{ date, mealSlotId }`; `courseIds` are the Courses to cook. */
export function useMarkAllCooked(_slot: SlotKey | null, _courseIds: number[]): MarkAllCookedController {
  return {
    rows: NONE,
    isLoading: false,
    setLeftover: () => {},
    confirm: async () => null,
    busy: false,
    error: null,
    result: null,
    warnings: NONE,
    dismissWarning: () => {},
  }
}

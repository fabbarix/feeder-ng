import type { MarkCookedController } from './useMarkCooked'
import type { StockSheetController } from './useStockSheet'
import type { SlotKey, StockWarning } from '../types'

export interface CookFlow {
  /** Slot whose Mark as Cooked sheet is open, or null. */
  cookKey: SlotKey | null
  /** Opens the Mark as Cooked sheet ("Adjust"). */
  open: (key: SlotKey) => void
  close: () => void
  cook: MarkCookedController
  stock: StockSheetController
  /** Sheet "Mark as Cooked": confirms with the edited Leftover and closes on success. */
  confirm: () => Promise<void>
  /** Sheet "Not cooked". */
  skip: () => Promise<void>
  /**
   * "Yes, Cooked" in one tap: GET .../cook for the proposal, POST .../cooked with proposedLeftover (nothing for a meal
   * served from a Leftover), invalidate the plan, toast (success) with lib/cook cookedSuccessText. A failure toasts the
   * cookedError copy (error) and changes nothing.
   */
  quickCook: (key: SlotKey) => Promise<void>
  /** Key being saved by quickCook, or null. */
  quickBusy: SlotKey | null
  /** Stock shortfall warnings still to show, from either path. */
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
}

/** Mark as Cooked orchestration shared by the Plan and Today: sheet flow (useMarkCooked + useStockSheet) and the one-tap path. */
export function useCookFlow(): CookFlow {
  throw new Error('not implemented (WP6)')
}

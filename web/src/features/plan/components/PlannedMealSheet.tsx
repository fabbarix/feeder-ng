import type { ReactNode } from 'react'
import type { PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface PlannedMealSheetProps {
  open: boolean
  onClose: () => void
  /** The slot opened from the day tile; null while closed. */
  slot: PlanSlot | null
  /** Household date: Cook is offered for today only, Mark as Cooked for today and past (lib/resolve). */
  today: string
  onCook: (key: SlotKey) => void
  onMarkCooked: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onPin: (key: SlotKey) => void
  onUnpin: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
}

/**
 * The Planned Meal sheet (ui-fix-plan 2.4, 5.2): title = Recipe name; meta line "Dinner · 19:00" and the facts
 * "1 Batch · 3.5 portions"; Attendance avatars when the slot has them; up to 3 chips plus a "+N" count chip
 * (lib/chips sheetChips); actions in this order: Cook (primary, today, planned only), Mark as Cooked (today and past,
 * planned only), Swap, Pin or Unpin (planned only), Choose a Recipe. A Cooked or Not cooked meal has no actions.
 */
export function PlannedMealSheet(_props: PlannedMealSheetProps): ReactNode {
  throw new Error('not implemented (WP6)')
}

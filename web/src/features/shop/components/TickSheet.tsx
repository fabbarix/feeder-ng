import type { BaseUnit } from '../types'

export interface TickSheetProps {
  open: boolean
  onClose: () => void
  name: string
  baseUnit: BaseUnit
  /** the Line's remaining quantity in Base Units, prefilled (0 for free text) */
  defaultQuantity: number
  /** quantity in Base Units: 0 only ticks, > 0 adds a Stock Lot */
  onSubmit: (quantity: number) => void
}

/**
 * "Tick by hand" (functional spec §9): a BottomSheet titled "Tick <name>" asking "How much?" in a field labelled
 * "How much?" prefilled with defaultQuantity (plain number, e.g. "1400"), the unit shown beside it. "Tick and add to
 * Stock" submits the number (>= 0; 0 is allowed); "Tick without adding" submits 0 at once. A negative or unparsable
 * entry shows "The amount cannot be negative" / "Enter an amount" and does not submit (stock/lib/amount parseAmount).
 * Stub until implemented.
 */
export function TickSheet(props: TickSheetProps) {
  void props
  return null
}

import type { ReactElement } from 'react'
import type { LotPatch, StockLot } from '../types'

export interface LotEditSheetProps {
  /** The Lot being corrected; null = closed. */
  lot: StockLot | null
  today: string
  onClose: () => void
  /** Called with what changed (never empty: with no change the sheet just closes). */
  onSubmit: (lot: StockLot, patch: LotPatch) => void
}

/**
 * BottomSheet "Edit <Name>" with the fields Quantity (suffix = Base Unit), Bought on (DateField, max today), Good until
 * (DateField, min Bought on) and, when the Lot's Shelf Life is null, a Switch "No go-off date"; Save in the footer.
 * State and rules are lib/lotEdit.ts (initialForm, changePurchased, changeGoesOff, toggleNoGoOff, checkLotForm); errors
 * show on the fields. Storage Place is not here: it changes with Move to.
 */
export function LotEditSheet(props: LotEditSheetProps): ReactElement | null {
  void props
  return null
}

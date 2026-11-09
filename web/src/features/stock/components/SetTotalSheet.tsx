import type { ReactElement } from 'react'
import type { BaseUnit } from '../types'

export interface SetTotalSheetProps {
  open: boolean
  onClose: () => void
  name: string
  baseUnit: BaseUnit
  /** Prefilled amount (the current total, or 0 for a Stock correction). */
  initial: number
  onSubmit: (total: number) => void
}

/**
 * BottomSheet "Set total for <name>" with an input labelled "New total" and a Save button.
 * Uses parseAmount(text, 'nonNegative'); an invalid entry shows its error text and does not submit.
 */
export function SetTotalSheet(props: SetTotalSheetProps): ReactElement | null {
  void props
  throw new Error('TODO')
}

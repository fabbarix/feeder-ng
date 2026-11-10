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
 * BottomSheet "Set total for <name>" with a `TextField` labelled "New total" (prefilled with `initial`, inputMode
 * decimal, `suffix` = baseUnit, parseAmount 'nonNegative', error inline via the field) and a primary Save in the
 * sheet `footer`. An invalid entry shows its error and does not submit.
 */
export function SetTotalSheet(_props: SetTotalSheetProps): ReactElement | null {
  throw new Error('not implemented')
}

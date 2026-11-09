import type { ReactNode } from 'react'
import type { Correction } from '../lib/cook'

export interface StockCorrectionSheetProps {
  open: boolean
  onClose: () => void
  correction: Correction | null
  onSave: (total: number) => void
  busy: boolean
  error: string | null
}

/** Bottom sheet that sets an Ingredient's Stock total (T10's Set total), prefilled with the correction's total. */
export function StockCorrectionSheet(props: StockCorrectionSheetProps): ReactNode {
  void props
  return null
}

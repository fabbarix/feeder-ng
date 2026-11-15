import type { ReactElement } from 'react'
import type { UnitSystem } from '../../../lib/units'
import type { CorrectionRow } from '../lib/shortfall'

export interface StockCorrectionSheetProps {
  open: boolean
  onClose: () => void
  /** "After cooking Cauliflower al gorgonzola". */
  context: string
  rows: CorrectionRow[]
  system?: UnitSystem
  /** Save: the value of every row by ingredientId (0 where the User changed nothing). */
  onSave: (values: Record<number, number>) => void
  busy?: boolean
  error?: string | null
}

/** B9-45 (PC-02) STUB. The one Correct Stock sheet: a row per Ingredient with a Stepper at its end, one Save. The developer builds it. */
export function StockCorrectionSheet(_props: StockCorrectionSheetProps): ReactElement | null {
  throw new Error('B9-45: not built yet')
}

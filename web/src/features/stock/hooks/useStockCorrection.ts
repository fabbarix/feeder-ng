import type { UnitSystem } from '../../../lib/units'
import type { CorrectionRow, ShortfallGroup } from '../lib/shortfall'

export interface StockCorrectionController {
  open: boolean
  /** The rows of the sheet (lib/shortfall correctionRows of the groups). */
  rows: CorrectionRow[]
  show: () => void
  close: () => void
  /** One PUT /api/stock/ingredients/:id/total per row the User raised above 0 (lib/shortfall correctionWrites), then the toast "Stock corrected for N Ingredients"; onSaved gets the id of EVERY row of the sheet. Resolves true when it closed. */
  save: (values: Record<number, number>) => Promise<boolean>
  busy: boolean
  error: string | null
}

/** B9-45 (PC-02) STUB: the state of the one Correct Stock sheet for the Cooked meals' shortfalls. */
export function useStockCorrection(_groups: ShortfallGroup[], _onSaved: (ingredientIds: number[]) => void, _system?: UnitSystem): StockCorrectionController {
  throw new Error('B9-45: not built yet')
}

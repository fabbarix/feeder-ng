// H9: typed calls for the quick Use of a Supply (household-items.md section 4.11). Undo sends back exactly the Lots a Use took.
import { http } from '../../lib/http'
import type { SupplyUseResult, UsedLot } from './types'

export const supplyUseApi = {
  /** Takes `quantity` (Base Units) of a Supply out of Stock, oldest Lot first. */
  use: (ingredientId: number, quantity: number) => http.post<SupplyUseResult>(`/api/stock/ingredients/${ingredientId}/use`, { quantity }),
  /** Puts back what a Use took. Not idempotent: each call adds the quantities again. */
  undo: (ingredientId: number, taken: UsedLot[]) => http.post<SupplyUseResult>(`/api/stock/ingredients/${ingredientId}/use/undo`, { taken }),
}

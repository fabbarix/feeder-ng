// B9-43 (SSP-13, SSP-14): what an open Line's sheet says about the Line. The TYPE only; B9-43's developer builds `lineDetails` in
// lib/lines.ts (lineEntry sets `entry.details`). Plain TypeScript, no React.
import type { BaseUnit } from '../types'

/** One R-E row (DetailRow): key, state at the end, muted detail. */
export interface SheetRow {
  state: string
  detail: string
}

/** A Planned Meal the Line is for, as a DetailRow: key "Sat Dinner", detail "French onion soup" (the server sends no amount per meal). */
export interface ForRow {
  key: string
  detail: string
}

export interface LineDetails {
  /** "To get": state "94 pieces", detail "16 × Onion pack (6 pieces)" ('' without a pack suggestion) */
  toGet: SheetRow
  /** "Estimated" / "Estimated at Coop": state "$47.84" or "No Price yet"; detail "$2.99 a pack, 14 Nov · not bought here yet" only for the priced fallback */
  estimate: SheetRow
  /** the Planned Meals the Line is for, oldest first, at most 5 */
  plannedMeals: ForRow[]
  /** how many more there are beyond the five ("and 2 more"); 0 when all are listed */
  morePlannedMeals: number
  /** "Not needed leaves these 3 Planned Meals short of Onion." / "…leaves Sat Dinner short of Onion."; '' without Planned Meals */
  consequence: string
  /** the Product "Change the Price" is for (the Line's suggested pack); null = no Product yet ("No Product yet: scan one in the Shop") */
  product: { id: number; name: string; packSize: number; baseUnit: BaseUnit } | null
  /** the Shop of the priced fallback's Price (pack.price.shopId); null for a last-bought pack */
  priceShopId: number | null
}

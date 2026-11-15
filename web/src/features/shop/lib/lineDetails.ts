// B9-43 (SSP-13, SSP-14): what an open Line's sheet says about the Line (lineEntry sets `entry.details`). Plain TypeScript, no React.
import { formatMinor } from '../../products/lib/money'
import { displayName } from '../../ingredients/lib/names'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { shopStrings } from '../strings'
import type { BaseUnit, PlannedMealRef, ShoppingLine } from '../types'
import { weekdayOf } from './rows'

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

/** How many "For" rows are listed before "and {n} more". */
export const MAX_FOR_ROWS = 5

/** "14 Nov": a Price's date (YYYY-MM-DD), day and short month. */
function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)))
}

/**
 * What an open Line's sheet says (SSP-13, SSP-14): To get with the pack ("16 × Onion pack (6 pieces)"; the size is named only when the
 * Product name does not already carry it), the estimate (with "$2.99 a pack, 14 Nov · not bought here yet" for the priced fallback only),
 * the Planned Meals it is for (oldest first, at most five) and what Not needed leaves short.
 */
export function lineDetails(line: ShoppingLine, currency: string, system: UnitSystem): LineDetails {
  const pack = line.pack
  const size = pack ? formatQuantity(pack.size, line.baseUnit, system) : ''
  const packName = pack ? (pack.name.includes(size) ? pack.name : `${pack.name} (${size})`) : ''
  const fallback = pack && pack.bought === false && pack.price ? pack.price : null
  const meals = [...(line.plannedMeals ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.mealSlotId - b.mealSlotId)
  const slot = (m: PlannedMealRef) => `${weekdayOf(m.date)} ${m.mealSlotName}`
  const ingredient = displayName(line.name)
  return {
    toGet: { state: formatQuantity(line.quantity, line.baseUnit, system), detail: pack ? `${pack.count} × ${packName}` : '' },
    estimate: {
      state: line.estimatedCostCents === null ? shopStrings.noPrice : formatMinor(line.estimatedCostCents, currency),
      detail: fallback ? shopStrings.notBoughtHereYet(formatMinor(fallback.cents, currency), shortDate(fallback.date)) : '',
    },
    plannedMeals: meals.slice(0, MAX_FOR_ROWS).map((m) => ({ key: slot(m), detail: m.recipeName })),
    morePlannedMeals: Math.max(0, meals.length - MAX_FOR_ROWS),
    consequence:
      meals.length === 0 ? '' : meals.length === 1 ? shopStrings.leavesShortOne(slot(meals[0]!), ingredient) : shopStrings.leavesShortMany(meals.length, ingredient),
    product: pack ? { id: pack.productId, name: pack.name, packSize: pack.size, baseUnit: line.baseUnit } : null,
    priceShopId: fallback ? fallback.shopId : null,
  }
}

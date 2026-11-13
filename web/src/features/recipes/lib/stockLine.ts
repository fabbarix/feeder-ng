import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { BaseUnit } from '../types'

// BR-D round 4 (design §13): the Stock line of a Base recipe's detail. Pure.

/** The Stock row of the Base recipe's Ingredient, as GET /api/stock lists it (only the fields the line reads). */
export interface StockTotal {
  total: number
  baseUnit: BaseUnit
}

/** "In the Pantry: 300 ml" from the Ingredient's Stock row; "In the Pantry: none" when there is no row or none of it. */
export function baseStockLine(row: StockTotal | undefined, system: UnitSystem): string {
  if (row === undefined || row.total <= 0) return 'In the Pantry: none'
  return `In the Pantry: ${formatQuantity(row.total, row.baseUnit, system)}`
}

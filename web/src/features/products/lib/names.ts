// Product naming helpers. Plain TypeScript, no React.
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { BaseUnit } from '../types'

/**
 * "700 g", "500 ml", "1 piece", "6 pieces" in metric: at most 2 decimals, trailing zeros dropped, no kg/l promotion.
 * Imperial goes through lib/units formatQuantity ("700 g" reads "1 lb 9 oz", "500 ml" reads "2 cups").
 */
export function formatPackSize(size: number, base: BaseUnit, system: UnitSystem = 'metric'): string {
  if (system === 'imperial') return formatQuantity(size, base, 'imperial')
  const n = Number(size.toFixed(2))
  const unit = base === 'piece' ? (n === 1 ? 'piece' : 'pieces') : base
  return `${n} ${unit}`
}

/**
 * The prefilled name of the unknown-barcode form and of a new Product: the
 * Ingredient name with its first letter capitalised, then the pack size
 * ("tomato passata", 700, 'g' -> "Tomato passata 700 g").
 */
export function defaultProductName(ingredientName: string, size: number, base: BaseUnit): string {
  const name = ingredientName.trim()
  const cap = name.charAt(0).toUpperCase() + name.slice(1)
  return `${cap} ${formatPackSize(size, base)}`
}

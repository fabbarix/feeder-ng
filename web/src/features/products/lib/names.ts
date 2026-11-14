// Product naming helpers. Plain TypeScript, no React.
import { formatQuantity, grouped, type UnitSystem } from '../../../lib/units'
import type { BaseUnit } from '../types'

/**
 * "700 g", "500 ml", "1 piece", "6 pieces" in metric: at most 2 decimals, trailing zeros dropped. From 1000 g / 1000 ml a pack
 * reads in kg and l as every other quantity does (SSP-16, decision SSP 7: "1.5 kg", "1 l"); pieces are only grouped
 * ("1,500 pieces"). Imperial goes through lib/units formatQuantity ("700 g" reads "1 lb 9 oz", "500 ml" reads "2 cups").
 */
export function formatPackSize(size: number, base: BaseUnit, system: UnitSystem = 'metric'): string {
  if (system === 'imperial') return formatQuantity(size, base, 'imperial')
  const n = Number(size.toFixed(2))
  if (base !== 'piece' && n >= 1000) return formatQuantity(size, base, 'metric')
  const unit = base === 'piece' ? (n === 1 ? 'piece' : 'pieces') : base
  return `${grouped(n, 2)} ${unit}`
}

/**
 * The prefilled name of the unknown-barcode form and of a new Product: the
 * Ingredient name with its first letter capitalised, then the pack size
 * ("tomato passata", 700, 'g' -> "Tomato passata 700 g"; "milk", 1000, 'ml' -> "Milk 1 l"). Only the prefill of a new
 * name follows the kg and l rule: a Product's stored name is never rewritten.
 */
export function defaultProductName(ingredientName: string, size: number, base: BaseUnit): string {
  const name = ingredientName.trim()
  const cap = name.charAt(0).toUpperCase() + name.slice(1)
  return `${cap} ${formatPackSize(size, base)}`
}

// Product naming helpers. Plain TypeScript, no React.
import type { BaseUnit } from '../types'

/** "700 g", "500 ml", "1 piece", "6 pieces"; at most 2 decimals, trailing zeros dropped; no kg/l promotion. */
export function formatPackSize(size: number, base: BaseUnit): string {
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

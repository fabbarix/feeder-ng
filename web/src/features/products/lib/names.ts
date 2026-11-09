// Product naming helpers. Plain TypeScript, no React.
import type { BaseUnit } from '../types'

/** "700 g", "500 ml", "1 piece", "6 pieces"; at most 2 decimals, trailing zeros dropped; no kg/l promotion. */
export function formatPackSize(size: number, base: BaseUnit): string {
  void size; void base
  throw new Error('TODO')
}

/**
 * The prefilled name of the unknown-barcode form and of a new Product: the
 * Ingredient name with its first letter capitalised, then the pack size
 * ("tomato passata", 700, 'g' -> "Tomato passata 700 g").
 */
export function defaultProductName(ingredientName: string, size: number, base: BaseUnit): string {
  void ingredientName; void size; void base
  throw new Error('TODO')
}

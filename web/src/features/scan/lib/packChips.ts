// Pack-size chips of the new-Product sheet (SR5, 13.5 step 3): the sizes of the Ingredient's known Products first, then the common
// sizes of its Base Unit. Plain TypeScript, no React.
import type { BaseUnit } from '../types'

/** A known Product, as far as the chips care: OfflineProduct fits. */
export interface PackProduct {
  ingredientId: number
  /** in Base Units */
  packSize: number
}

export interface PackChip {
  /** stable id of the size: its size in Base Units as text ("500", "1000") */
  key: string
  /** in Base Units */
  size: number
  /** what the form keeps as the typed pack size and unit: 1000 g is "1" kg, 1500 ml is "1.5" l */
  value: string
  unit: string
  /** "500 g", "1 kg", "1.5 l", "6 pieces" */
  label: string
}

export interface PackSuggestions {
  /** known sizes ascending, then the common sizes not already there; at most MAX_PACK_CHIPS */
  chips: PackChip[]
  /** the first chip when the Ingredient has exactly one usual size (one distinct size among its known Products), else null */
  preselected: PackChip | null
}

export const MAX_PACK_CHIPS = 5

/** g: 250 g, 500 g, 1 kg. ml: 500 ml, 1 l. piece: 1, 4, 6, 10. */
export const COMMON_SIZES: Record<BaseUnit, number[]> = { g: [250, 500, 1000], ml: [500, 1000], piece: [1, 4, 6, 10] }

/** `ingredientId` is absent for an Ingredient still to be created: then no Product is known. */
export function suggestPackChips(ingredient: { ingredientId?: number; baseUnit: BaseUnit }, products: PackProduct[]): PackSuggestions {
  const known = [
    ...new Set(
      products
        .filter((p) => ingredient.ingredientId !== undefined && p.ingredientId === ingredient.ingredientId)
        .map((p) => p.packSize),
    ),
  ].sort((a, b) => a - b)
  const common = COMMON_SIZES[ingredient.baseUnit].filter((size) => !known.includes(size))
  const chips = [...known, ...common].slice(0, MAX_PACK_CHIPS).map((size) => packChip(size, ingredient.baseUnit))
  return { chips, preselected: known.length === 1 ? (chips[0] ?? null) : null }
}

/** The chip of one size in Base Units (the label, and the value and unit the form keeps). */
export function packChip(size: number, base: BaseUnit): PackChip {
  const key = String(size)
  if (base === 'piece') {
    const label = size === 1 ? '1 piece' : `${size} pieces`
    return { key, size, value: key, unit: 'piece', label }
  }
  const big = size >= 1000
  const unit = base === 'g' ? (big ? 'kg' : 'g') : big ? 'l' : 'ml'
  const value = big ? String(size / 1000) : key
  return { key, size, value, unit, label: `${value} ${unit}` }
}

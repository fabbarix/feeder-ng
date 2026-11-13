// H6: the Supplies of the Pantry: each Supply's Restock level (from the catalogue) and its Stock (summed over the Lots), and whether
// the Household has a Supply at all. Food has neither a level nor a Restock. The maths lives in lib/supplies.
import { useCallback, useMemo } from 'react'
import { householdHasSupply, restockLevelsOf, restockOf, supplyStockOf, type Restock } from '../lib/supplies'
import type { IngredientChoice, StockLot } from '../types'

export interface UseSupplyRestock {
  /** The Restock of one Ingredient, or null (food, or a Supply without a level). */
  restockFor(ingredientId: number): Restock | null
  /** The Household has a Supply, in its catalogue or its Stock: the Food or Supplies filter shows. */
  hasSupplies: boolean
}

export function useSupplyRestock(choices: readonly IngredientChoice[], lots: readonly StockLot[] | undefined): UseSupplyRestock {
  const levels = useMemo(() => restockLevelsOf(choices), [choices])
  const stock = useMemo(() => supplyStockOf(lots ?? []), [lots])
  const restockFor = useCallback((ingredientId: number) => restockOf(ingredientId, levels, stock), [levels, stock])
  const hasSupplies = useMemo(() => householdHasSupply(lots ?? [], choices), [lots, choices])
  return { restockFor, hasSupplies }
}

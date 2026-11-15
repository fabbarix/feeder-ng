// B9-43 (SSP-09): how many of the Stock Lots this list's ticks and Scans added are still Not sorted. Plain TypeScript, no React.
// The list JSON carries no Lot ids (B9-23), so the count is by Ingredient and day: approximate by design.
import type { StockLot } from '../../stock/types'
import type { ShoppingList } from '../types'

/**
 * The Not sorted Stock Lots (`storagePlaceId === null`) bought today (`purchased === list.today`) of an Ingredient the list has ticked (a
 * ticked Line or a ticked Ingredient extra), not from a Stock-take. A Lot with no `storagePlaceId` at all (an older fixture) is not claimed.
 */
export function unsortedFromList(lots: StockLot[], list: ShoppingList): number {
  const ticked = new Set<number>()
  for (const line of list.lines) if (line.ticked) ticked.add(line.ingredientId)
  for (const extra of list.extras) if (extra.ticked && extra.ingredientId !== null) ticked.add(extra.ingredientId)
  return lots.filter((lot) => lot.storagePlaceId === null && lot.purchased === list.today && lot.source !== 'stock_take' && ticked.has(lot.ingredientId)).length
}

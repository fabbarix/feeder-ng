// B9-43 (SSP-09): how many of the Stock Lots this list's ticks and Scans added are still Not sorted. Plain TypeScript, no React.
// STUB (test author): the developer builds it.
import type { StockLot } from '../../stock/types'
import type { ShoppingList } from '../types'

/**
 * The Not sorted Stock Lots (`storagePlaceId === null`) bought today (`purchased === list.today`) of an Ingredient the list has ticked (a
 * ticked Line or a ticked Ingredient extra), not from a Stock-take.
 */
export function unsortedFromList(_lots: StockLot[], _list: ShoppingList): number {
  throw new Error('not implemented (B9-43)')
}

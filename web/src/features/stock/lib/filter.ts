import type { UnitSystem } from '../../../lib/units'
import type { IngredientStock } from '../types'

export type StockFilter = 'all' | 'useSoon' | 'spoiled'
export const STOCK_FILTERS: readonly StockFilter[] = ['all', 'useSoon', 'spoiled']

/**
 * Pure. `all` keeps everything, `useSoon` keeps items with useSoon, `spoiled` keeps spoiledCount > 0.
 * `query` is matched accent- and case-insensitively against the name; every word must match.
 * Does not mutate; keeps the input order.
 */
export function filterTotals(_items: IngredientStock[], _filter: StockFilter, _query: string): IngredientStock[] {
  throw new Error('not implemented')
}

/**
 * Pure. The go-off phrase for the row meta, relative to the household's `today` (YYYY-MM-DD):
 * null -> '' ; -1 'went off yesterday'; < -1 'went off 3 days ago'; 0 'goes off today'; 1 'goes off tomorrow';
 * 2..6 'goes off Thu' (en-GB short weekday); >= 7 'goes off 20 Nov'.
 */
export function goOffPhrase(_goesOff: string | null, _today: string): string {
  throw new Error('not implemented')
}

/**
 * Pure. The ListRow meta: '1 Stock Lot' or '2 Stock Lots', then ' · ' and the go-off phrase of
 * `nextGoesOff` when the item is use-soon or has spoiled lots (otherwise only the lot count).
 */
export function rowMeta(_item: IngredientStock, _today: string): string {
  throw new Error('not implemented')
}

/** True when the meta line must be drawn in the spoil colour with HourglassMedium. */
export function isDue(item: IngredientStock): boolean {
  return item.useSoon || item.spoiledCount > 0
}

export type { UnitSystem }

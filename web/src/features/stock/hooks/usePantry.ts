// The Pantry list: every Stock Lot with the Storage Places, and its groups for the view on screen. React hook over lib/pantry. The
// view comes in: the list, the filters that apply, the sort and the grouping from the URL (usePantryFilters), the search from the screen.
import { useMemo } from 'react'
import { pantryGroups, type PantryGroup, type PantryView } from '../lib/pantry'
import type { PantryMode } from '../lib/pantryFilters'
import type { UsePantryFilters } from './usePantryFilters'
import type { StockLot, StoragePlace } from '../types'
import { usePantryLeftovers, type PantryLeftovers } from './usePantryLeftovers'
import { useAllLots, type LotsState } from './useStock'
import { useStoragePlaces } from './useStoragePlaces'

export type { PantryMode }

export interface UsePantryInput {
  filters: Pick<UsePantryFilters, 'mode' | 'applied' | 'sort' | 'groupByPlace'>
  /** The search text. */
  query: string
}

export interface UsePantry {
  lots: LotsState
  places: StoragePlace[]
  groups: PantryGroup[]
  placeOf: (lot: StockLot) => StoragePlace | null
  /** B5-LOW: the frozen Leftovers in the Pantry, with their flow and sections. */
  leftovers: PantryLeftovers
}

export function usePantry({ filters, query }: UsePantryInput): UsePantry {
  const { mode, applied, sort, groupByPlace } = filters
  const view = useMemo<PantryView>(
    () => ({ query, status: applied.status, stock: applied.stock, places: applied.places, kinds: applied.kinds, sort, groupByPlace }),
    [query, applied, sort, groupByPlace],
  )
  const lots = useAllLots()
  const { places } = useStoragePlaces()
  const groups = useMemo(() => pantryGroups(lots.data ?? [], places, view), [lots.data, places, view])
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const leftovers = usePantryLeftovers({ today: lots.today ?? '', mode, places, view, groups, onlyLeftovers: applied.onlyLeftovers })
  return {
    leftovers,
    lots,
    places,
    groups,
    placeOf: (lot) => (lot.storagePlaceId != null ? (byId.get(lot.storagePlaceId) ?? null) : null),
  }
}

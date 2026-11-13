// pantry-filter: the search and the rows of the Storage Place list in the Pantry's Filters panel (docs/design/pantry-filter.md 4.6, 6).
import { useState } from 'react'
import { placeFilterRows, type PlaceFilterRow } from '../lib/pantryFilters'
import { stockStrings as strings } from '../strings'
import type { StockLot, StoragePlace } from '../types'

export interface UsePlaceFilterSearch {
  query: string
  setQuery(query: string): void
  rows: PlaceFilterRow[]
  /** What the list says in place of its rows when nothing matches; null while there are rows. */
  emptyText: string | null
}

export function usePlaceFilterSearch(places: readonly StoragePlace[], lots: readonly StockLot[], selected: readonly number[]): UsePlaceFilterSearch {
  const [query, setQuery] = useState('')
  const rows = placeFilterRows(places, lots, selected, query)
  const emptyText = rows.length === 0 ? strings.filterBar.noPlaceMatch(query.trim()) : null
  return { query, setQuery, rows, emptyText }
}

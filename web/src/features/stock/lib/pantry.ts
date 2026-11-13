// The Pantry list: every Stock Lot, filtered, sorted and grouped by Storage Place. Plain TypeScript, no React.
import type { StockLot, StorageKind, StoragePlace } from '../types'
import { fold, type StockFilter } from './filter'

/** Sort orders of the Pantry list. */
export type PantrySort = 'goodUntil' | 'name' | 'quantity' | 'purchased' | 'place'
export const PANTRY_SORTS: readonly PantrySort[] = ['goodUntil', 'name', 'quantity', 'purchased', 'place']

/** 0 stands for "Not sorted" (Lots in no Storage Place) in the place filter. */
export const UNSORTED = 0

export interface PantryView {
  query: string
  /** all, use soon or spoiled (the server's flags) */
  status: StockFilter
  /** Storage Place ids to show (UNSORTED for Lots in none); empty = every place */
  places: number[]
  /** kinds to show (a Lot in no place counts as none of them); empty = every kind */
  kinds: StorageKind[]
  sort: PantrySort
  /** one group per Storage Place (in place-name order, "Not sorted" last) instead of one flat list */
  groupByPlace: boolean
}

export const DEFAULT_VIEW: PantryView = { query: '', status: 'all', places: [], kinds: [], sort: 'goodUntil', groupByPlace: true }

export interface PantryGroup {
  /** the Storage Place, or null for "Not sorted" (and for the single group of an ungrouped list) */
  place: StoragePlace | null
  /** UNSORTED for "Not sorted", -1 for the single group of an ungrouped list */
  key: number
  lots: StockLot[]
}

const words = (query: string) => fold(query.trim()).split(/\s+/).filter(Boolean)

/** Pure. Keeps the Lots that pass every filter of `view`. */
export function filterLots(lots: StockLot[], places: StoragePlace[], view: PantryView): StockLot[] {
  const terms = words(view.query)
  const kindOf = new Map(places.map((p) => [p.id, p.kind]))
  return lots.filter((lot) => {
    if (view.status === 'useSoon' && !lot.useSoon) return false
    if (view.status === 'spoiled' && !lot.spoiled) return false
    const placeId = lot.storagePlaceId ?? UNSORTED
    if (view.places.length > 0 && !view.places.includes(placeId)) return false
    if (view.kinds.length > 0) {
      const kind = kindOf.get(placeId)
      if (!kind || !view.kinds.includes(kind)) return false
    }
    if (terms.length === 0) return true
    const name = fold(lot.ingredientName)
    return terms.every((t) => name.includes(t))
  })
}

const byName = (a: StockLot, b: StockLot) => a.ingredientName.localeCompare(b.ingredientName, undefined, { sensitivity: 'base' })
/** No go-off date sorts last; ties by name, then id, so the order is stable. */
const byGoodUntil = (a: StockLot, b: StockLot) => {
  if (a.goesOff !== b.goesOff) {
    if (a.goesOff === null) return 1
    if (b.goesOff === null) return -1
    return a.goesOff < b.goesOff ? -1 : 1
  }
  return byName(a, b) || a.id - b.id
}

/** Pure. Sorts a copy: good until (soonest first), name, quantity (largest first), purchased (newest first) or Storage Place name. */
export function sortLots(lots: StockLot[], sort: PantrySort, places: StoragePlace[] = []): StockLot[] {
  const nameOf = new Map(places.map((p) => [p.id, p.name]))
  const placeName = (l: StockLot) => (l.storagePlaceId != null ? (nameOf.get(l.storagePlaceId) ?? '') : '￿')
  const compare: Record<PantrySort, (a: StockLot, b: StockLot) => number> = {
    goodUntil: byGoodUntil,
    name: (a, b) => byName(a, b) || byGoodUntil(a, b),
    quantity: (a, b) => b.quantity - a.quantity || byName(a, b) || a.id - b.id,
    purchased: (a, b) => (a.purchased === b.purchased ? byGoodUntil(a, b) : a.purchased < b.purchased ? 1 : -1),
    place: (a, b) => placeName(a).localeCompare(placeName(b)) || byGoodUntil(a, b),
  }
  return [...lots].sort(compare[sort])
}

/**
 * Pure. The Pantry list for `view`: filtered, sorted, and grouped by Storage Place (every place that still has a Lot,
 * by name, then "Not sorted") or one group. Empty groups are left out.
 */
export function pantryGroups(lots: StockLot[], places: StoragePlace[], view: PantryView): PantryGroup[] {
  const shown = sortLots(filterLots(lots, places, view), view.sort, places)
  if (!view.groupByPlace) return shown.length > 0 ? [{ place: null, key: -1, lots: shown }] : []
  const sortedPlaces = [...places].sort((a, b) => a.name.localeCompare(b.name))
  const groups: PantryGroup[] = sortedPlaces.map((place) => ({ place, key: place.id, lots: shown.filter((l) => l.storagePlaceId === place.id) }))
  const known = new Set(places.map((p) => p.id))
  groups.push({ place: null, key: UNSORTED, lots: shown.filter((l) => l.storagePlaceId == null || !known.has(l.storagePlaceId)) })
  return groups.filter((g) => g.lots.length > 0)
}

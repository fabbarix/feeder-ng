// B9-29 (SSP-10): Put away a whole shop at once. Pure rules behind the Put away sheet (no React).
import type { StockLot, StoragePlace } from '../types'

/** A single move of the Put away request. */
export interface PutAwayMove {
  lotId: number
  storagePlaceId: number
}

/** What POST /api/stock/lots/put-away answers: the moved Lots, and the ids it skipped (already sorted meanwhile). */
export interface PutAwayResult {
  lots: StockLot[]
  skipped: number[]
}

/** The Lots with no Storage Place, in the order given. */
export function unsortedLots(lots: readonly StockLot[]): StockLot[] {
  return lots.filter((l) => l.storagePlaceId == null)
}

/** The "Put into" Select's first value: last used here, else the default place, else the first fridge, else the first place. */
export function defaultPutAwayPlace(places: readonly StoragePlace[], lastUsedId: number | null): number | null {
  if (lastUsedId != null && places.some((p) => p.id === lastUsedId)) return lastUsedId
  const pick = places.find((p) => p.default) ?? places.find((p) => p.kind === 'fridge') ?? places[0]
  return pick ? pick.id : null
}

/** A new Set with the id added, or removed when it was in. */
export function toggleLot(selected: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** The request's moves, in the list's order, for the ticked Lots that are still in the list. */
export function putAwayMoves(lots: readonly StockLot[], selected: ReadonlySet<number>, placeId: number): PutAwayMove[] {
  return lots.filter((l) => selected.has(l.id)).map((l) => ({ lotId: l.id, storagePlaceId: placeId }))
}

const lotsWord = (n: number) => (n === 1 ? 'Stock Lot' : 'Stock Lots')

/** "Put away 17 Stock Lots" / "Put away 1 Stock Lot". */
export function putAwayTitle(n: number): string {
  return `Put away ${n} ${lotsWord(n)}`
}

/** The primary's name: "Move 4 to Kitchen Fridge". */
export function moveLabel(n: number, placeName: string): string {
  return `Move ${n} to ${placeName}`
}

/** The status line after a move: "2 Stock Lots moved to Kitchen Fridge". */
export function movedStatus(n: number, placeName: string): string {
  return `${n} ${lotsWord(n)} moved to ${placeName}`
}

/** The Lots still to put away after a move: the moved ones and the skipped ones leave. */
export function afterMove(lots: readonly StockLot[], result: PutAwayResult): StockLot[] {
  const gone = new Set<number>([...result.lots.map((l) => l.id), ...result.skipped])
  return lots.filter((l) => !gone.has(l.id))
}

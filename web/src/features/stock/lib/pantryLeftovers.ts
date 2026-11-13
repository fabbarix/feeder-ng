// Pantry: frozen Leftovers in their Freezer group (U4). Pure.
import { leftoverStrings, portionsLabel, useByPhrase } from '../../../lib/leftovers/copy'
import { dayDiff } from '../../../lib/leftovers/dates'
import { NOT_SORTED_PLACE, type Leftover } from '../../../lib/leftovers'
import type { StockLot, StorageKind, StoragePlace } from '../types'
import { fold, type StockFilter } from './filter'
import { UNSORTED, type PantryGroup } from './pantry'

export interface LeftoverGroup {
  /** The Storage Place id; 0 (NOT_SORTED_PLACE) for "Not sorted". */
  placeId: number
  name: string
  leftovers: Leftover[]
}

export interface PantryLeftoverView {
  /** Storage Place ids (0 = Not sorted); empty = every place. */
  places: number[]
  kinds: StorageKind[]
  search: string
}

/** The Leftovers the Pantry shows: frozen ones with portions left. Taken-out and unfrozen Leftovers are not Stock. */
export function pantryLeftovers(leftovers: Leftover[]): Leftover[] {
  return leftovers.filter((l) => l.frozen && l.portions > 0)
}

/** The Storage Place a Leftover is in: its place when the Household still has it, else NOT_SORTED_PLACE. */
function placeOf(l: Leftover, places: StoragePlace[]): StoragePlace | null {
  return places.find((p) => p.id === l.storagePlaceId) ?? null
}

/** Groups in Storage Place order, only places that hold a Leftover; a missing or deleted place goes to "Not sorted", last. */
export function leftoverGroups(leftovers: Leftover[], places: StoragePlace[]): LeftoverGroup[] {
  const shown = pantryLeftovers(leftovers)
  const groups: LeftoverGroup[] = []
  for (const place of places) {
    const inPlace = shown.filter((l) => placeOf(l, places)?.id === place.id)
    if (inPlace.length > 0) groups.push({ placeId: place.id, name: place.name, leftovers: inPlace })
  }
  const unsorted = shown.filter((l) => placeOf(l, places) === null)
  if (unsorted.length > 0) groups.push({ placeId: NOT_SORTED_PLACE, name: leftoverStrings.notSorted, leftovers: unsorted })
  return groups
}

/** The Pantry's place, kind and search filters applied to Leftovers (Recipe name, folded). */
export function filterPantryLeftovers(leftovers: Leftover[], places: StoragePlace[], view: PantryLeftoverView): Leftover[] {
  const query = fold(view.search.trim())
  return pantryLeftovers(leftovers).filter((l) => {
    const place = placeOf(l, places)
    if (view.places.length > 0 && !view.places.includes(place?.id ?? NOT_SORTED_PLACE)) return false
    if (view.kinds.length > 0 && (place === null || !view.kinds.includes(place.kind))) return false
    return query === '' || fold(l.recipeName).includes(query)
  })
}

/** "Chilli", "3 portions · Use by 10 Feb". */
export function pantryLeftoverText(l: Leftover, today: string): { title: string; meta: string } {
  return { title: l.recipeName, meta: `${portionsLabel(l.portions)} · ${useByPhrase(l.useBy, today)}` }
}

/** The Stock Lot "Use soon" window: today and the three days after (the same rule as the Lots). */
export const LEFTOVER_USE_SOON_DAYS = 3

/**
 * The Pantry's "Use soon" and "Spoiled" filters for Leftovers. Use soon: a Use-by from today to today + 3, not past, and never
 * a Leftover to answer. Spoiled: a Leftover to answer. "All" keeps every frozen Leftover. With no Household date (empty
 * `today`) there is no day maths, so Use soon is empty.
 */
export function statusLeftovers(leftovers: Leftover[], status: StockFilter, today: string): Leftover[] {
  if (status === 'all') return leftovers
  if (status === 'spoiled') return leftovers.filter((l) => l.toAnswer)
  if (today === '') return []
  return leftovers.filter((l) => {
    if (l.toAnswer) return false
    const days = dayDiff(l.useBy, today)
    return days >= 0 && days <= LEFTOVER_USE_SOON_DAYS
  })
}

/** One section of the Pantry list: a Storage Place (or Not sorted), or the one ungrouped list (key -1). */
export interface PantrySection {
  key: number
  name: string
  lots: StockLot[]
  leftovers: Leftover[]
}

/**
 * The Pantry list's sections: each Storage Place's Stock Lots and frozen Leftovers together, by name with "Not sorted" last;
 * ungrouped, one section with the Lots and then the Leftovers. Empty sections are left out.
 */
export function pantrySections(lotGroups: PantryGroup[], leftovers: Leftover[], places: StoragePlace[], groupByPlace: boolean): PantrySection[] {
  if (!groupByPlace) {
    const lots = lotGroups.flatMap((g) => g.lots)
    return lots.length + leftovers.length > 0 ? [{ key: -1, name: '', lots, leftovers }] : []
  }
  const byKey = new Map<number, PantrySection>()
  for (const g of lotGroups) {
    if (g.key === -1) continue
    byKey.set(g.key, { key: g.key, name: g.place?.name ?? leftoverStrings.notSorted, lots: g.lots, leftovers: [] })
  }
  for (const g of leftoverGroups(leftovers, places)) {
    const section = byKey.get(g.placeId) ?? { key: g.placeId, name: g.name, lots: [], leftovers: [] }
    section.leftovers = g.leftovers
    byKey.set(g.placeId, section)
  }
  const sections = [...byKey.values()].filter((s) => s.lots.length + s.leftovers.length > 0)
  return sections.sort((a, b) => (a.key === UNSORTED ? 1 : 0) - (b.key === UNSORTED ? 1 : 0) || a.name.localeCompare(b.name))
}

/**
 * The delete confirm of a Storage Place that holds frozen Leftovers: they are named and say they stay frozen, marked Not sorted.
 * With none, the usual Stock sentence (`stockBody`) stands.
 */
export function placeDeleteBody(inPlace: Leftover[], stockBody: string): string {
  if (inPlace.length === 0) return stockBody
  const names = inPlace.map((l) => l.recipeName).join(', ')
  const stays = inPlace.length === 1 ? `1 frozen Leftover (${names}) stays frozen, marked Not sorted.` : `${inPlace.length} frozen Leftovers (${names}) stay frozen, marked Not sorted.`
  return `${stockBody} ${stays}`
}

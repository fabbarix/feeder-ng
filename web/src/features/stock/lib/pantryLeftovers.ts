// Pantry: frozen Leftovers in their Freezer group (U4). Pure.
import { leftoverStrings, portionsLabel, useByPhrase } from '../../../lib/leftovers/copy'
import { NOT_SORTED_PLACE, type Leftover } from '../../../lib/leftovers'
import type { StorageKind, StoragePlace } from '../types'
import { fold } from './filter'

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

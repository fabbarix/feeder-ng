// Pantry: frozen Leftovers in their Freezer group (U4). Pure. STUB (red).
import type { Leftover } from '../../../lib/leftovers'
import type { StorageKind, StoragePlace } from '../types'

export interface LeftoverGroup {
  /** The Storage Place id; 0 (UNSORTED) for "Not sorted". */
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
export function pantryLeftovers(_leftovers: Leftover[]): Leftover[] {
  return []
}

/** Groups in Storage Place order, only places that hold a Leftover; a missing or deleted place goes to "Not sorted", last. */
export function leftoverGroups(_leftovers: Leftover[], _places: StoragePlace[]): LeftoverGroup[] {
  return []
}

/** The Pantry's place, kind and search filters applied to Leftovers (Recipe name, folded). */
export function filterPantryLeftovers(_leftovers: Leftover[], _places: StoragePlace[], _view: PantryLeftoverView): Leftover[] {
  return []
}

/** "Chilli", "3 portions · Use by 9 Feb". */
export function pantryLeftoverText(_l: Leftover, _today: string): { title: string; meta: string } {
  return { title: '', meta: '' }
}

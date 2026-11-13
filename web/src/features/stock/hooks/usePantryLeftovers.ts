// B5-LOW: the frozen Leftovers of the Pantry, filtered like the Lots and placed in the Storage Place sections. React-facing:
// the flow (sheets, questions, details) and the list; the rules are in lib/pantryLeftovers.
import { useLeftoverFlow, type LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import { filterPantryLeftovers, pantryLeftovers, pantrySections, statusLeftovers, type PantrySection } from '../lib/pantryLeftovers'
import type { PantryGroup, PantryView } from '../lib/pantry'
import type { StoragePlace } from '../types'
import type { PantryMode } from '../lib/pantryFilters'

export interface PantryLeftovers {
  flow: LeftoverFlow
  /** How many frozen Leftovers the Pantry holds: the "Leftovers" filter shows when there are any. */
  frozenCount: number
  /** The Storage Place sections with their Lots and Leftovers (the Storage Place view only). */
  sections: PantrySection[]
}

export function usePantryLeftovers(input: {
  today: string
  mode: PantryMode
  places: StoragePlace[]
  view: PantryView
  groups: PantryGroup[]
  /** The "Leftovers" filter (in the URL): only the frozen Leftovers are listed. */
  onlyLeftovers: boolean
}): PantryLeftovers {
  const { today, mode, places, view, groups, onlyLeftovers } = input
  const flow = useLeftoverFlow(today)
  const placesView = mode === 'places'
  // Filtered by Storage Place, kind, search and the status filter (Use soon: Use-by today or tomorrow; Spoiled: to answer).
  const shown = placesView
    ? statusLeftovers(filterPantryLeftovers(flow.leftovers, places, { places: view.places, kinds: view.kinds, search: view.query }), view.status, today)
    : []
  const sections = placesView ? pantrySections(onlyLeftovers ? [] : groups, shown, places, view.groupByPlace) : []
  return { flow, frozenCount: pantryLeftovers(flow.leftovers).length, sections }
}

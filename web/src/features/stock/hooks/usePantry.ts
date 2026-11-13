// The Pantry list: every Stock Lot with the Storage Places, the view (filters, sort, grouping) and its groups. React
// hook over lib/pantry.
import { useMemo, useState } from 'react'
import { DEFAULT_VIEW, pantryGroups, type PantryGroup, type PantryView } from '../lib/pantry'
import type { StockLot, StoragePlace } from '../types'
import { usePantryLeftovers, type PantryLeftovers } from './usePantryLeftovers'
import { useAllLots, type LotsState } from './useStock'
import { useStoragePlaces } from './useStoragePlaces'

/** The Pantry's two lists: every Lot by Storage Place (default), or the per-Ingredient totals. */
export type PantryMode = 'places' | 'ingredients'

/** Where this device remembers the chosen list (a per-viewer convenience; storage may be missing or throw). */
export const PANTRY_MODE_KEY = 'feeder:pantry-mode'

function readMode(): PantryMode {
  try {
    return globalThis.localStorage?.getItem(PANTRY_MODE_KEY) === 'ingredients' ? 'ingredients' : 'places'
  } catch {
    return 'places'
  }
}

function writeMode(mode: PantryMode): void {
  try {
    globalThis.localStorage?.setItem(PANTRY_MODE_KEY, mode)
  } catch {
    // private mode or blocked storage: the choice lasts for this visit only
  }
}

export interface UsePantry {
  mode: PantryMode
  setMode: (mode: PantryMode) => void
  lots: LotsState
  places: StoragePlace[]
  view: PantryView
  setView: (change: Partial<PantryView>) => void
  groups: PantryGroup[]
  placeOf: (lot: StockLot) => StoragePlace | null
  /** B5-LOW: the frozen Leftovers in the Pantry, with their flow and sections. */
  leftovers: PantryLeftovers
}

export function usePantry(): UsePantry {
  const lots = useAllLots()
  const { places } = useStoragePlaces()
  const [view, setViewState] = useState<PantryView>(DEFAULT_VIEW)
  const [mode, setModeState] = useState<PantryMode>(readMode)
  const groups = useMemo(() => pantryGroups(lots.data ?? [], places, view), [lots.data, places, view])
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const leftovers = usePantryLeftovers({ today: lots.today ?? '', mode, places, view, groups })
  return {
    leftovers,
    mode,
    setMode: (m) => {
      setModeState(m)
      writeMode(m)
    },
    lots,
    places,
    view,
    setView: (change) => setViewState((v) => ({ ...v, ...change })),
    groups,
    placeOf: (lot) => (lot.storagePlaceId != null ? (byId.get(lot.storagePlaceId) ?? null) : null),
  }
}

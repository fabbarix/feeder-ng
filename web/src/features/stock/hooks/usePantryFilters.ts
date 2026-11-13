// pantry-filter: the Pantry's view and filters in the URL (?view, ?status, ?place, ?kind, ?leftovers, ?sort, ?group), with the filters
// that apply and their chips (docs/design/pantry-filter.md 6). Every change replaces the history entry, so Back leaves the Pantry and
// coming back to /pantry?… restores them. The chosen list is also remembered on the device (a per-viewer convenience).
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FilterChip } from '../../../ui/FilterBar/types'
import type { StockFilter } from '../lib/filter'
import type { PantrySort } from '../lib/pantry'
import {
  appliedFilters,
  pantryFilterChips,
  pantryFiltersFromParams,
  withGroupByPlace,
  withKindToggled,
  withLeftovers,
  withMode,
  withPlaceToggled,
  withSort,
  withStatus,
  withoutChip,
  withoutPantryFilters,
  type AppliedPantryFilters,
  type PantryChipKey,
  type PantryMode,
} from '../lib/pantryFilters'
import type { StorageKind, StoragePlace } from '../types'

/** Where this device remembers the chosen list (storage may be missing or throw). */
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

export interface UsePantryFilters {
  /** The list: the URL's, else the device's, else By Storage Place. */
  mode: PantryMode
  setMode(mode: PantryMode): void
  status: StockFilter
  /** Choosing the status in force again clears it (no "All": nothing chosen is all of Stock). */
  setStatus(status: StockFilter): void
  places: number[]
  togglePlace(id: number): void
  kinds: StorageKind[]
  toggleKind(kind: StorageKind): void
  leftovers: boolean
  setLeftovers(on: boolean): void
  sort: PantrySort
  setSort(sort: PantrySort): void
  groupByPlace: boolean
  setGroupByPlace(on: boolean): void
  /** The filters that apply to the list on screen. */
  applied: AppliedPantryFilters
  chips: FilterChip<PantryChipKey>[]
  count: number
  remove(key: PantryChipKey): void
  clear(): void
}

export function usePantryFilters(places: readonly StoragePlace[]): UsePantryFilters {
  const [params, setParams] = useSearchParams()
  // useSearchParams keeps its object while the address is the same, so these stay the same objects between renders.
  const state = useMemo(() => pantryFiltersFromParams(params), [params])
  const mode = state.mode ?? readMode()
  const applied = useMemo(() => appliedFilters(state, mode, places), [state, mode, places])
  const write = useCallback((edit: (prev: URLSearchParams) => URLSearchParams) => setParams((prev) => edit(prev), { replace: true }), [setParams])
  const chips = pantryFilterChips(state, mode, places)
  return {
    mode,
    setMode: (next) => {
      writeMode(next)
      write((prev) => withMode(prev, next))
    },
    status: state.status,
    setStatus: (next) => write((prev) => withStatus(prev, next === pantryFiltersFromParams(prev).status ? 'all' : next)),
    places: state.places,
    togglePlace: (id) => write((prev) => withPlaceToggled(prev, id)),
    kinds: state.kinds,
    toggleKind: (kind) => write((prev) => withKindToggled(prev, kind)),
    leftovers: state.leftovers,
    setLeftovers: (on) => write((prev) => withLeftovers(prev, on)),
    sort: state.sort,
    setSort: (next) => write((prev) => withSort(prev, next)),
    groupByPlace: state.groupByPlace,
    setGroupByPlace: (on) => write((prev) => withGroupByPlace(prev, on)),
    applied,
    chips,
    count: chips.length,
    remove: (key) => write((prev) => withoutChip(prev, key)),
    clear: () => write(withoutPantryFilters),
  }
}

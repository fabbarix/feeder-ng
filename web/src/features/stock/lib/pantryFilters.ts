// pantry-filter: the Pantry's filters and view in the URL, the filters that apply, the active chips and the Storage Place rows of the
// Filters panel (docs/design/pantry-filter.md 4, 6). Plain TypeScript, no React.
import type { FilterChip } from '../../../ui/FilterBar/types'
import { stockStrings as strings } from '../strings'
import type { StockLot, StorageKind, StoragePlace } from '../types'
import { fold, type StockFilter } from './filter'
import { STORAGE_KINDS, KIND_ICON } from './kinds'
import { PANTRY_SORTS, UNSORTED, type PantrySort } from './pantry'

/** The Pantry's two lists: every Lot by Storage Place (default), or the per-Ingredient totals. */
export type PantryMode = 'places' | 'ingredients'

export interface PantryFilterState {
  /** `?view=`; null when absent or unknown (the list the device remembers applies). */
  mode: PantryMode | null
  /** `?status=useSoon|spoiled`; 'all' when absent or unknown. */
  status: StockFilter
  /** `?place=<id>`, `?place=none` (UNSORTED); positive whole ids, no repeats, in URL order. */
  places: number[]
  /** `?kind=`, no repeats, in URL order. */
  kinds: StorageKind[]
  /** `?leftovers=1`: only the frozen Leftovers. */
  leftovers: boolean
  /** `?sort=`; 'goodUntil' when absent or unknown. */
  sort: PantrySort
  /** `?group=off` turns grouping off. */
  groupByPlace: boolean
}

const MODES: readonly PantryMode[] = ['places', 'ingredients']
const STATUSES: readonly StockFilter[] = ['useSoon', 'spoiled']
const NOT_SORTED_PARAM = 'none'

const unique = <T,>(list: T[]): T[] => [...new Set(list)]

function parsePlace(raw: string): number | null {
  const v = raw.trim()
  if (v === NOT_SORTED_PARAM) return UNSORTED
  return /^[1-9]\d*$/.test(v) ? Number(v) : null
}

const placeParam = (id: number) => (id === UNSORTED ? NOT_SORTED_PARAM : String(id))

/** Reads the Pantry's view and filters from the URL. Unknown values are ignored. */
export function pantryFiltersFromParams(params: URLSearchParams): PantryFilterState {
  const mode = params.get('view')
  const status = params.get('status')
  const sort = params.get('sort')
  return {
    mode: MODES.includes(mode as PantryMode) ? (mode as PantryMode) : null,
    status: STATUSES.includes(status as StockFilter) ? (status as StockFilter) : 'all',
    places: unique(params.getAll('place').map(parsePlace).filter((id): id is number => id !== null)),
    kinds: unique(params.getAll('kind').filter((k): k is StorageKind => STORAGE_KINDS.includes(k as StorageKind))),
    leftovers: params.get('leftovers') === '1',
    sort: PANTRY_SORTS.includes(sort as PantrySort) ? (sort as PantrySort) : 'goodUntil',
    groupByPlace: params.get('group') !== 'off',
  }
}

const copy = (params: URLSearchParams) => new URLSearchParams(params)

/** A copy with `view` set to the list. */
export function withMode(params: URLSearchParams, mode: PantryMode): URLSearchParams {
  const next = copy(params)
  next.set('view', mode)
  return next
}

/** A copy with `status` set, or removed for 'all'. */
export function withStatus(params: URLSearchParams, status: StockFilter): URLSearchParams {
  const next = copy(params)
  if (status === 'all') next.delete('status')
  else next.set('status', status)
  return next
}

/** A copy with every value of `name` replaced by `values` (in order); the other parameters are kept in place. */
function withAll(params: URLSearchParams, name: string, values: readonly string[]): URLSearchParams {
  const next = copy(params)
  next.delete(name)
  for (const v of values) next.append(name, v)
  return next
}

/** A copy with the Storage Place added (at the end), or removed when it is there. The other places keep their order. */
export function withPlaceToggled(params: URLSearchParams, id: number): URLSearchParams {
  const places = pantryFiltersFromParams(params).places
  const next = places.includes(id) ? places.filter((p) => p !== id) : [...places, id]
  return withAll(params, 'place', next.map(placeParam))
}

/** A copy with the kind added (at the end), or removed when it is there. */
export function withKindToggled(params: URLSearchParams, kind: StorageKind): URLSearchParams {
  const kinds = pantryFiltersFromParams(params).kinds
  return withAll(params, 'kind', kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind])
}

/** A copy with `leftovers=1`, or without it. */
export function withLeftovers(params: URLSearchParams, on: boolean): URLSearchParams {
  const next = copy(params)
  if (on) next.set('leftovers', '1')
  else next.delete('leftovers')
  return next
}

/** A copy with `sort` set, or removed for the default (Good until). */
export function withSort(params: URLSearchParams, sort: PantrySort): URLSearchParams {
  const next = copy(params)
  if (sort === 'goodUntil') next.delete('sort')
  else next.set('sort', sort)
  return next
}

/** A copy with `group=off`, or without it (grouped is the default). */
export function withGroupByPlace(params: URLSearchParams, on: boolean): URLSearchParams {
  const next = copy(params)
  if (on) next.delete('group')
  else next.set('group', 'off')
  return next
}

/** A copy without the filters (status, place, kind, leftovers); the list, the sort and the grouping are kept. */
export function withoutPantryFilters(params: URLSearchParams): URLSearchParams {
  const next = copy(params)
  for (const name of ['status', 'place', 'kind', 'leftovers']) next.delete(name)
  return next
}

/** Which filter an active chip removes. */
export type PantryChipKey = 'status' | 'leftovers' | `kind:${StorageKind}` | `place:${number}`

/** A copy without the filter of one chip. */
export function withoutChip(params: URLSearchParams, key: PantryChipKey): URLSearchParams {
  if (key === 'status') return withStatus(params, 'all')
  if (key === 'leftovers') return withLeftovers(params, false)
  const [kind, value] = key.split(':') as [string, string]
  if (kind === 'kind') return withKindToggled(params, value as StorageKind)
  const state = pantryFiltersFromParams(params)
  const id = Number(value)
  return state.places.includes(id) ? withPlaceToggled(params, id) : copy(params)
}

/** The filters that apply to the list on screen. */
export interface AppliedPantryFilters {
  status: StockFilter
  /** Known Storage Place ids and UNSORTED; empty = every place. */
  places: number[]
  kinds: StorageKind[]
  onlyLeftovers: boolean
}

/** The places of the URL that apply: the Household's Storage Places and Not sorted (a deleted or unknown id is ignored). */
function knownPlaces(state: PantryFilterState, places: readonly StoragePlace[]): number[] {
  const ids = new Set(places.map((p) => p.id))
  return state.places.filter((id) => id === UNSORTED || ids.has(id))
}

/** By Ingredient only the status applies; By Storage Place every filter does, an unknown Storage Place excepted. */
export function appliedFilters(state: PantryFilterState, mode: PantryMode, places: readonly StoragePlace[]): AppliedPantryFilters {
  if (mode === 'ingredients') return { status: state.status, places: [], kinds: [], onlyLeftovers: false }
  return { status: state.status, places: knownPlaces(state, places), kinds: state.kinds, onlyLeftovers: state.leftovers }
}

/** A chip of the Filters panel's Show section: the status (one at a time) or Leftovers. */
export type PantryShow = 'useSoon' | 'spoiled' | 'leftovers'

/**
 * The Show chips the panel offers: Use soon and Spoiled (no "All": none pressed is all of Stock), and Leftovers on By Storage Place
 * while the Pantry holds frozen Leftovers (docs/design/pantry-filter.md 4.3, 4.8).
 */
export function showChoices(mode: PantryMode, hasLeftovers: boolean): PantryShow[] {
  return mode === 'places' && hasLeftovers ? ['useSoon', 'spoiled', 'leftovers'] : ['useSoon', 'spoiled']
}

/** The Show chips pressed now: the status in force, and Leftovers when it applies (By Storage Place). */
export function shownChoices(status: StockFilter, leftovers: boolean, mode: PantryMode): PantryShow[] {
  const shown: PantryShow[] = status === 'all' ? [] : [status]
  return mode === 'places' && leftovers ? [...shown, 'leftovers'] : shown
}

/** Storage Places by name (accents and case ignored, numbers in order). */
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })

/**
 * The chips of the filters that apply, in the order of the panel: the status, Leftovers, each kind, each Storage Place by name and
 * Not sorted last. One chip per filter, so the count of the Filters button is the number of chips.
 */
export function pantryFilterChips(state: PantryFilterState, mode: PantryMode, places: readonly StoragePlace[]): FilterChip<PantryChipKey>[] {
  const applied = appliedFilters(state, mode, places)
  const chips: FilterChip<PantryChipKey>[] = []
  const t = strings.filterBar
  if (applied.status !== 'all') {
    const label = strings.filters[applied.status]
    chips.push({ key: 'status', label, removeLabel: t.remove(label), status: applied.status === 'useSoon' ? 'spoil' : 'danger' })
  }
  if (applied.onlyLeftovers) chips.push({ key: 'leftovers', label: strings.leftoversFilter, removeLabel: t.remove(strings.leftoversFilter), status: 'leftover' })
  for (const kind of STORAGE_KINDS) {
    if (!applied.kinds.includes(kind)) continue
    const label = strings.kinds[kind]
    chips.push({ key: `kind:${kind}`, label, removeLabel: t.removeKind(label), icon: KIND_ICON[kind] })
  }
  const chosen = new Set(applied.places)
  for (const place of [...places].sort(byName)) {
    if (chosen.has(place.id)) chips.push({ key: `place:${place.id}`, label: place.name, removeLabel: t.removePlace(place.name) })
  }
  if (chosen.has(UNSORTED)) chips.push({ key: `place:${UNSORTED}`, label: strings.unsorted, removeLabel: t.removePlace(strings.unsorted) })
  return chips
}

/** One row of the Storage Place list in the Filters panel. */
export interface PlaceFilterRow {
  /** The Storage Place id, UNSORTED for Not sorted. */
  id: number
  name: string
  /** null for Not sorted. */
  kind: StorageKind | null
  /** How many Stock Lots are in it. */
  lots: number
  selected: boolean
}

const words = (query: string) => fold(query.trim()).split(/\s+/).filter(Boolean)

/**
 * Every Storage Place by name, then Not sorted, each with its Lot count (a Lot in a deleted place counts as Not sorted). The query
 * matches accent- and case-blind, every word. Rows keep this order whether selected or not.
 */
export function placeFilterRows(
  places: readonly StoragePlace[],
  lots: readonly StockLot[],
  selected: readonly number[],
  query: string,
): PlaceFilterRow[] {
  const ids = new Set(places.map((p) => p.id))
  const count = new Map<number, number>()
  for (const lot of lots) {
    const id = lot.storagePlaceId != null && ids.has(lot.storagePlaceId) ? lot.storagePlaceId : UNSORTED
    count.set(id, (count.get(id) ?? 0) + 1)
  }
  const rows: PlaceFilterRow[] = [...places].sort(byName).map((p) => ({ id: p.id, name: p.name, kind: p.kind, lots: count.get(p.id) ?? 0, selected: selected.includes(p.id) }))
  rows.push({ id: UNSORTED, name: strings.unsorted, kind: null, lots: count.get(UNSORTED) ?? 0, selected: selected.includes(UNSORTED) })
  const terms = words(query)
  return terms.length === 0 ? rows : rows.filter((r) => terms.every((term) => fold(r.name).includes(term)))
}

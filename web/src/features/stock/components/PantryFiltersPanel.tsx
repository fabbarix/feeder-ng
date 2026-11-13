// pantry-filter: the Pantry's Filters panel: Show (Use soon, Spoiled, Leftovers), Kind, Storage Place and Group by Storage Place, then
// Clear filters and Show Stock (docs/design/pantry-filter.md 4, 7, 8). The shared FiltersPanel: a popover from 768 px, a sheet below.
import type { ReactNode, RefObject } from 'react'
import { FilterChipGroup, FilterSection, FiltersPanel, Switch } from '../../../ui'
import type { StockFilter, StockKindFilter } from '../lib/filter'
import { KIND_ICON, STORAGE_KINDS } from '../lib/kinds'
import { showChoices, shownChoices, stockChoices, type PantryMode, type PantryShow } from '../lib/pantryFilters'
import { stockStrings as strings } from '../strings'
import type { StockKind, StockLot, StorageKind, StoragePlace } from '../types'
import { PlaceFilterList } from './PlaceFilterList'

export interface PantryFiltersPanelProps {
  id?: string
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  mode: PantryMode
  status: StockFilter
  onStatus: (status: StockFilter) => void
  /** H6: Food or Supplies in force ('all' = both). */
  /** H6: Food or Supplies in force ('all' = both; absent = both). */
  stock?: StockKindFilter
  /** H6: a press of Food or Supplies; the caller toggles it. */
  onStock?: (stock: StockKind) => void
  /** H6: the Household has a Supply, so the Food or Supplies section shows (absent = no Supply). */
  hasSupplies?: boolean
  /** Whether the Pantry holds frozen Leftovers: the "Leftovers" chip shows only then. */
  hasLeftovers: boolean
  leftovers: boolean
  onLeftovers: (on: boolean) => void
  kinds: readonly StorageKind[]
  onKind: (kind: StorageKind) => void
  places: readonly StoragePlace[]
  lots: readonly StockLot[]
  selectedPlaces: readonly number[]
  onPlace: (id: number) => void
  groupByPlace: boolean
  onGroupByPlace: (on: boolean) => void
  /** Filters in force: Clear filters is off while there are none. */
  count: number
  onClear: () => void
}

export function PantryFiltersPanel(props: PantryFiltersPanelProps): ReactNode {
  const { id, open, onClose, anchorRef, mode, status, onStatus, stock = 'all', onStock = () => {}, hasSupplies = false, hasLeftovers, leftovers, onLeftovers, kinds, onKind, places, lots, selectedPlaces, onPlace, groupByPlace, onGroupByPlace, count, onClear } = props
  const t = strings.filterBar
  const byPlace = mode === 'places'
  const show = showChoices(mode, hasLeftovers).map((value) => ({ value, label: value === 'leftovers' ? strings.leftoversFilter : strings.filters[value] }))
  const onShow = (value: PantryShow) => (value === 'leftovers' ? onLeftovers(!leftovers) : onStatus(value))
  const stockOptions = stockChoices(hasSupplies).map((value) => ({ value, label: strings.stockFilter[value === 'food' ? 'food' : 'supplies'] }))

  return (
    <FiltersPanel id={id} open={open} onClose={onClose} anchorRef={anchorRef} count={count} onClear={onClear} showLabel={t.showStock} className="pantry-filters__panel">
      <FilterSection heading={t.showHeading}>
        <FilterChipGroup<PantryShow> label={t.showHeading} options={show} selected={shownChoices(status, leftovers, mode)} onToggle={onShow} />
      </FilterSection>
      {stockOptions.length > 0 ? (
        <FilterSection heading={strings.stockFilter.heading}>
          <FilterChipGroup<StockKind>
            label={strings.stockFilter.heading}
            options={stockOptions}
            selected={stock === 'all' ? [] : [stock]}
            onToggle={onStock}
          />
        </FilterSection>
      ) : null}
      {byPlace && places.length > 0 ? (
        <FilterSection heading={t.kindHeading}>
          <FilterChipGroup<StorageKind>
            label={t.kindGroup}
            options={STORAGE_KINDS.map((k) => ({ value: k, label: strings.kinds[k], icon: KIND_ICON[k] }))}
            selected={kinds}
            onToggle={onKind}
          />
        </FilterSection>
      ) : null}
      {byPlace && places.length > 0 ? (
        <FilterSection heading={t.placeHeading} list>
          <PlaceFilterList places={places} lots={lots} selected={selectedPlaces} onToggle={onPlace} />
        </FilterSection>
      ) : null}
      {byPlace ? (
        <FilterSection>
          <Switch label={strings.groupByPlace} checked={groupByPlace} onChange={onGroupByPlace} />
        </FilterSection>
      ) : null}
    </FiltersPanel>
  )
}

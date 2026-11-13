// pantry-filter: the Storage Place filter of the Pantry's Filters panel: a searchable list of every Storage Place with its kind and
// Lot count, Not sorted last; several can be chosen (docs/design/pantry-filter.md 4.4, 7).
import type { ReactNode } from 'react'
import { Icon, OptionList } from '../../../ui'
import { usePlaceFilterSearch } from '../hooks/usePlaceFilterSearch'
import { KIND_ICON } from '../lib/kinds'
import { stockStrings as strings } from '../strings'
import type { StockLot, StoragePlace } from '../types'

export interface PlaceFilterListProps {
  places: readonly StoragePlace[]
  lots: readonly StockLot[]
  /** The Storage Places chosen now (UNSORTED for Not sorted). */
  selected: readonly number[]
  onToggle: (id: number) => void
}

export function PlaceFilterList({ places, lots, selected, onToggle }: PlaceFilterListProps): ReactNode {
  const { query, setQuery, rows, emptyText } = usePlaceFilterSearch(places, lots, selected)
  const options = rows.map((r) => ({
    value: r.id,
    label: r.name,
    meta: strings.filterBar.lots(r.lots),
    leading: <Icon name={r.kind ? KIND_ICON[r.kind] : 'location'} size={20} />,
  }))
  return (
    <OptionList<number>
      label={strings.filterBar.placeList}
      searchLabel={strings.filterBar.placeSearch}
      query={query}
      onQueryChange={setQuery}
      options={options}
      selected={rows.filter((r) => r.selected).map((r) => r.id)}
      onToggle={onToggle}
      emptyText={emptyText}
      multiple
    />
  )
}

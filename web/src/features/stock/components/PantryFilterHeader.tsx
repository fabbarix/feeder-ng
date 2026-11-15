// The Pantry's filter header (docs/design/pantry-filter.md 3): Search Stock and Filters; the view row (FilterBarViewRow: the List
// control and, in the Storage Place view, the Sort chip, icon-only when its value does not fit: DS-03, decision DS 6); the active
// filter chips. Render and wiring only.
import type { ReactElement, RefObject } from 'react'
import { ActiveFilterChips, FilterBarViewRow, FiltersButton, SearchField, type FilterChip } from '../../../ui'
import type { PantrySort } from '../lib/pantry'
import type { PantryChipKey, PantryMode } from '../lib/pantryFilters'
import { stockStrings as strings } from '../strings'
import { PantryModeControl } from './PantryModeControl'
import { PantrySortSelect } from './PantrySortSelect'

export interface PantryFilterHeaderProps {
  query: string
  onQuery: (query: string) => void
  filtersAnchor: RefObject<HTMLButtonElement | null>
  count: number
  panelOpen: boolean
  panelId: string
  onTogglePanel: () => void
  onOpenPanel: () => void
  mode: PantryMode
  onMode: (mode: PantryMode) => void
  sort: PantrySort
  onSort: (sort: PantrySort) => void
  chips: FilterChip<PantryChipKey>[]
  onRemoveChip: (key: PantryChipKey) => void
}

export function PantryFilterHeader(p: PantryFilterHeaderProps): ReactElement {
  return (
    <div className="filter-bar">
      <div className="filter-bar__row filter-bar__search-row">
        <SearchField label={strings.searchLabel} value={p.query} onChange={p.onQuery} />
        <FiltersButton ref={p.filtersAnchor} count={p.count} expanded={p.panelOpen} controls={p.panelOpen ? p.panelId : undefined} onClick={p.onTogglePanel} />
      </div>
      <FilterBarViewRow
        view={<PantryModeControl value={p.mode} onChange={p.onMode} />}
        sort={p.mode === 'places' ? ({ iconOnly }) => <PantrySortSelect value={p.sort} onChange={p.onSort} iconOnly={iconOnly} /> : undefined}
      />
      <ActiveFilterChips chips={p.chips} onRemove={p.onRemoveChip} onMore={p.onOpenPanel} fallbackFocus={p.filtersAnchor} />
    </div>
  )
}

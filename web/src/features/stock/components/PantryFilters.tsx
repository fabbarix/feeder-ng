import type { ReactElement } from 'react'
import { Chip, Select, Switch } from '../../../ui'
import { PANTRY_SORTS, UNSORTED, toggle, type PantrySort, type PantryView } from '../lib/pantry'
import { stockStrings as strings } from '../strings'
import type { StorageKind, StoragePlace } from '../types'

export interface PantryFiltersProps {
  view: PantryView
  places: StoragePlace[]
  onChange: (change: Partial<PantryView>) => void
}

const KINDS: StorageKind[] = ['pantry', 'fridge', 'freezer']
const KIND_ICON = { pantry: 'stock', fridge: 'fridge', freezer: 'freezer' } as const

/** The Pantry list's own controls: Storage Place and kind filter chips (several at once), the sort and "Group by Storage Place". */
export function PantryFilters({ view, places, onChange }: PantryFiltersProps): ReactElement {
  return (
    <>
      {places.length > 0 ? (
        <div className="stock-screen__filters" role="group" aria-label={strings.placesFilter}>
          {places.map((p) => (
            <Chip key={p.id} kind="filter" icon={KIND_ICON[p.kind]} selected={view.places.includes(p.id)} onClick={() => onChange({ places: toggle(view.places, p.id) })}>
              {p.name}
            </Chip>
          ))}
          <Chip kind="filter" selected={view.places.includes(UNSORTED)} onClick={() => onChange({ places: toggle(view.places, UNSORTED) })}>
            {strings.unsorted}
          </Chip>
        </div>
      ) : null}
      <div className="stock-screen__filters" role="group" aria-label={strings.kindsFilter}>
        {KINDS.map((k) => (
          <Chip key={k} kind="filter" icon={KIND_ICON[k]} selected={view.kinds.includes(k)} onClick={() => onChange({ kinds: toggle(view.kinds, k) })}>
            {strings.kinds[k]}
          </Chip>
        ))}
      </div>
      <Select<PantrySort>
        label={strings.sortLabel}
        options={PANTRY_SORTS.map((s) => ({ value: s, label: strings.sorts[s] }))}
        value={view.sort}
        onChange={(sort) => onChange({ sort })}
      />
      <Switch label={strings.groupByPlace} checked={view.groupByPlace} onChange={(groupByPlace) => onChange({ groupByPlace })} />
    </>
  )
}

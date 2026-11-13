// pantry-filter: the Sort of the Pantry list, a compact chip with the sort icon on the shared Select (no native control;
// docs/design/pantry-filter.md 3, 9). The chip shows a short value, the list the long label.
import type { ReactNode } from 'react'
import { Select } from '../../../ui'
import { PANTRY_SORTS, type PantrySort } from '../lib/pantry'
import { stockStrings as strings } from '../strings'

export interface PantrySortSelectProps {
  value: PantrySort
  onChange: (sort: PantrySort) => void
}

const shortOf: Partial<Record<PantrySort, string>> = strings.sortsShort

export function PantrySortSelect({ value, onChange }: PantrySortSelectProps): ReactNode {
  return (
    <Select<PantrySort>
      label={strings.sortLabel}
      appearance="chip"
      icon="sort"
      options={PANTRY_SORTS.map((s) => ({ value: s, label: strings.sorts[s], triggerLabel: shortOf[s] }))}
      value={value}
      onChange={onChange}
    />
  )
}

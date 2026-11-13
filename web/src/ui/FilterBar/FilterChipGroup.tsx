// One line of toggle filter chips in a Filters panel (Use soon, Spoiled; Pantry, Fridge, Freezer). It never wraps: it scrolls sideways,
// its chips keep their natural width, and it is padded so their focus rings are not cut (docs/design/pantry-filter.md 5).
import type { ReactNode } from 'react'
import { Chip } from '../Chip'
import type { IconName } from '../icons'
import './FilterBar.css'

export interface FilterChipOption<V extends string> {
  value: V
  label: string
  icon?: IconName
}

export interface FilterChipGroupProps<V extends string> {
  /** The group's accessible name ("Show", "Filter by kind"). */
  label: string
  options: readonly FilterChipOption<V>[]
  /** The values pressed now. */
  selected: readonly V[]
  /** A press on a chip: the caller decides what it means (one choice or several). */
  onToggle: (value: V) => void
}

export function FilterChipGroup<V extends string>({ label, options, selected, onToggle }: FilterChipGroupProps<V>): ReactNode {
  return (
    <div role="group" aria-label={label} className="filter-chip-group">
      {options.map((o) => (
        <Chip key={o.value} kind="filter" icon={o.icon} selected={selected.includes(o.value)} onClick={() => onToggle(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

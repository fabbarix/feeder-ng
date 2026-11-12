import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import type { CourseFilter, FilterChip } from '../lib/timeline'
import { cookStrings } from '../strings'

export interface CourseFilterChipsProps {
  chips: FilterChip[]
  selected: CourseFilter
  onSelect: (filter: CourseFilter) => void
}

/** "All · Main · Side": a group named Courses of filter chips; exactly the selected one is pressed. Nothing for an empty list. */
export function CourseFilterChips({ chips, selected, onSelect }: CourseFilterChipsProps): ReactNode {
  if (chips.length === 0) return null
  return (
    <div role="group" aria-label={cookStrings.coursesGroup} className="cook-courses">
      {chips.map((chip) => (
        <Chip key={String(chip.id)} kind="filter" selected={chip.id === selected} onClick={() => onSelect(chip.id)}>
          {chip.label}
        </Chip>
      ))}
    </div>
  )
}

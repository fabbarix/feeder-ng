import type { ReactNode } from 'react'
import type { CourseFilter, FilterChip } from '../lib/timeline'

export interface CourseFilterChipsProps {
  chips: FilterChip[]
  selected: CourseFilter
  onSelect: (filter: CourseFilter) => void
}

/**
 * STUB (CRS F). "All · Main · Side": a `role="group"` named "Courses" of the shared `Chip` (kind filter, `selected`,
 * `aria-pressed`); exactly one chip is pressed. Renders nothing for an empty list.
 */
export function CourseFilterChips(_props: CourseFilterChipsProps): ReactNode {
  return null
}

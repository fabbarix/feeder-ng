import type { ReactNode } from 'react'
import type { CourseChoice } from '../../../lib/courses'

export interface CourseFilterProps {
  /** Active Courses, household order. */
  courses: readonly CourseChoice[]
  /** The Course filter in use, null for all Recipes. */
  selected: number | null
  onSelect: (id: number | null) => void
}

/** CRS E2: the Course filter of the Recipes list: a group of filter Chips ("All Courses", then one per Course). Renders nothing with fewer than two Courses. */
export function CourseFilter(_props: CourseFilterProps): ReactNode {
  return null
}

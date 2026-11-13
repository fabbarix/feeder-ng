import type { ReactNode } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import { Chip } from '../../../ui'
import { courseStrings } from '../strings'

export interface CourseFilterProps {
  /** Active Courses, household order. */
  courses: readonly CourseChoice[]
  /** The Course filter in use, null for all Recipes. */
  selected: number | null
  onSelect: (id: number | null) => void
}

/** CRS E2: the Course filter of the Recipes list: a group of toggle filter Chips, one per Course. Single choice: pressing a Course
 *  selects it, pressing the selected one again clears it; none pressed means every Recipe. Renders nothing with fewer than two Courses. */
export function CourseFilter({ courses, selected, onSelect }: CourseFilterProps): ReactNode {
  if (courses.length < 2) return null
  return (
    <div role="group" aria-label={courseStrings.filterLabel} className="course-filter">
      {courses.map((c) => (
        <Chip key={c.id} kind="filter" selected={selected === c.id} onClick={() => onSelect(selected === c.id ? null : c.id)}>
          {c.name}
        </Chip>
      ))}
    </div>
  )
}

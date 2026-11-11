// The toggle chips: one per active Course, in household order. Shared Chip as a filter chip (aria-pressed).
import { Chip } from '../Chip'
import type { CourseChoice } from '../../lib/courses'
import { coursePickerStrings as s } from './strings'

export interface CourseChipsProps {
  courses: readonly CourseChoice[]
  chosen: readonly number[]
  disabled?: boolean
  /** Id of the hidden text the main Course chip points at (aria-describedby). */
  mainId: string
  onToggle: (id: number) => void
}

export function CourseChips({ courses, chosen, disabled, mainId, onToggle }: CourseChipsProps) {
  const hasMain = courses.some((c) => c.main)
  return (
    <div className="course-picker__chips">
      {courses.map((c) => (
        <Chip
          key={c.id}
          kind="filter"
          selected={chosen.includes(c.id)}
          disabled={disabled}
          aria-describedby={c.main ? mainId : undefined}
          onClick={() => onToggle(c.id)}
        >
          {c.name}
        </Chip>
      ))}
      {hasMain && (
        <span id={mainId} className="visually-hidden">
          {s.mainCourse}
        </span>
      )}
    </div>
  )
}

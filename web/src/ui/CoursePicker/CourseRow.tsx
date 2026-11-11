// One chosen Course in the ordered list: the drag handle (from Sortable), the name, the main marker, the row extras,
// then Move up, Move down and Remove. Keyed by Course id, so the extras keep their state when the order changes.
import type { ReactNode } from 'react'
import { IconButton } from '../IconButton'
import type { SortableRenderContext } from '../Sortable'
import type { CourseChoice } from '../../lib/courses'
import { coursePickerStrings as s } from './strings'

export interface CourseRowProps {
  course: CourseChoice
  ctx: SortableRenderContext
  /** How many Courses are chosen: the last row cannot move down. */
  count: number
  disabled?: boolean
  extras?: ReactNode
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

export function CourseRow({ course, ctx, count, disabled, extras, onMove, onRemove }: CourseRowProps) {
  const { index, itemProps, handle } = ctx
  const className = ['course-picker__row', itemProps.className].filter(Boolean).join(' ')
  const hasExtras = extras !== undefined && extras !== null && typeof extras !== 'boolean'
  return (
    <li {...itemProps} className={className}>
      {handle}
      <span className="course-picker__name" data-testid="course-name">
        {course.name}
      </span>
      {course.main && <span className="course-picker__main">{s.mainCourse}</span>}
      {hasExtras && <div className="course-picker__extras">{extras}</div>}
      <div className="course-picker__actions">
        <IconButton
          icon="moveUp"
          label={s.moveUp(course.name)}
          disabled={disabled || index === 0}
          data-focus-key={`${course.id}:up`}
          onClick={() => onMove(-1)}
        />
        <IconButton
          icon="moveDown"
          label={s.moveDown(course.name)}
          disabled={disabled || index === count - 1}
          data-focus-key={`${course.id}:down`}
          onClick={() => onMove(1)}
        />
        <IconButton icon="close" label={s.remove(course.name)} disabled={disabled} onClick={onRemove} />
      </div>
    </li>
  )
}

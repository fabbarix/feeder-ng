// One chosen Course in the ordered list (SET-09): the drag handle (from Sortable), the text block (the name and a muted meta line:
// "main Course" and the caller's words), the row extras, then Move up, Move down and Remove in one IconSet. The DOM order is
// handle, text, extras, actions; the grid places them. Keyed by Course id, so the extras keep their state when the order changes.
import type { ReactNode } from 'react'
import { IconButton } from '../IconButton'
import { IconSet } from '../IconSet'
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
  /** More words for the meta line, after "main Course" ("Chiara does not eat it"). */
  meta?: string | null
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

export function CourseRow({ course, ctx, count, disabled, extras, meta, onMove, onRemove }: CourseRowProps) {
  const { index, itemProps, handle } = ctx
  const className = ['course-picker__row', itemProps.className].filter(Boolean).join(' ')
  const hasExtras = extras !== undefined && extras !== null && typeof extras !== 'boolean'
  const metaLine = [course.main ? s.mainCourse : null, meta || null].filter(Boolean).join(' \u00b7 ')
  return (
    <li {...itemProps} className={className}>
      {handle}
      <span className="course-picker__text">
        <span className="course-picker__name" data-testid="course-name">
          {course.name}
        </span>
        {metaLine ? <span className="course-picker__meta">{metaLine}</span> : null}
      </span>
      {hasExtras && <div className="course-picker__extras">{extras}</div>}
      <div className="course-picker__actions">
        <IconSet>
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
        <IconButton icon="remove" label={s.remove(course.name)} disabled={disabled} onClick={onRemove} />
        </IconSet>
      </div>
    </li>
  )
}

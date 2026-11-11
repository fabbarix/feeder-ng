// The chosen Courses in the slot's order: the shared Sortable (handles, keyboard and pointer reorder), one CourseRow each.
import type { ReactNode } from 'react'
import { Sortable } from '../Sortable'
import type { CourseChoice } from '../../lib/courses'
import { CourseRow } from './CourseRow'
import { coursePickerStrings as s } from './strings'

export interface CourseListProps {
  label: string
  /** The chosen Courses, in the slot's order. */
  rows: readonly CourseChoice[]
  disabled?: boolean
  renderRowExtras?: (row: { course: CourseChoice; index: number; count: number }) => ReactNode
  onReorder: (from: number, to: number) => void
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (id: number) => void
}

export function CourseList({ label, rows, disabled, renderRowExtras, onReorder, onMove, onRemove }: CourseListProps) {
  const count = rows.length
  return (
    <Sortable<CourseChoice>
      as="ol"
      className="course-picker__list"
      aria-label={s.chosenList(label)}
      items={rows}
      getKey={(c) => String(c.id)}
      getLabel={(c) => c.name}
      onReorder={onReorder}
      disabled={disabled}
      renderItem={(course, ctx) => (
        <CourseRow
          course={course}
          ctx={ctx}
          count={count}
          disabled={disabled}
          extras={renderRowExtras?.({ course, index: ctx.index, count })}
          onMove={(delta) => onMove(ctx.index, delta)}
          onRemove={() => onRemove(course.id)}
        />
      )}
    />
  )
}

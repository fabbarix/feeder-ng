// One Course in Settings > Courses: the handle (Admin, from Sortable), the name or the rename field, what uses it, and the
// actions menu. Renders and wires events only; the menu items come from lib/courseList.
import { Button, Chip, Menu, TextField, type SortableRenderContext } from '../../../ui'
import type { Course } from '../../../lib/courses'
import { coursesStrings as s } from '../coursesStrings'
import { courseActions, courseMeta, type CourseAction } from '../lib/courseList'

export interface RenameState {
  value: string
  error?: string
  busy?: boolean
}

export interface CourseRowProps {
  course: Course
  /** An Admin can act on the row; a plain User reads it. */
  canEdit: boolean
  /** Set for the sortable list (Admin): the handle and the li's props. */
  sortable?: SortableRenderContext
  onAction: (action: CourseAction['id']) => void
  /** Archived rows: the Admin's Unarchive button (no menu). */
  onUnarchive?: () => void
  renaming?: RenameState
  onRenameChange?: (value: string) => void
  onRenameSave?: () => void
  onRenameCancel?: () => void
}

export function CourseRow({ course, canEdit, sortable, onAction, onUnarchive, renaming, onRenameChange, onRenameSave, onRenameCancel }: CourseRowProps) {
  const isRenaming = renaming !== undefined

  const meta = courseMeta(course)
  const className = ['course-row', course.archived ? 'course-row--archived' : undefined, sortable?.itemProps.className].filter(Boolean).join(' ')

  return (
    <li {...sortable?.itemProps} className={className} data-course-id={course.id}>
      {sortable ? sortable.handle : null}
      <div className="course-row__body">
        <div className="course-row__title">
          <span className="course-row__name" data-testid="course-name">
            {course.name}
          </span>
          {course.main ? (
            <span data-testid="course-main-chip">
              <Chip>{s.mainChip}</Chip>
            </span>
          ) : null}
        </div>
        {renaming ? (
          <TextField
            autoFocus
            label={s.renameLabel(course.name)}
            value={renaming.value}
            error={renaming.error}
            onChange={(value) => onRenameChange?.(value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onRenameSave?.()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onRenameCancel?.()
              }
            }}
          />
        ) : null}
        {meta && !isRenaming ? <span className="course-row__meta">{meta}</span> : null}
        {isRenaming ? (
          <div className="course-row__rename-actions">
            <Button variant="secondary" disabled={renaming.busy} onClick={() => onRenameSave?.()}>
              {s.save}
            </Button>
            <Button variant="tertiary" disabled={renaming.busy} onClick={() => onRenameCancel?.()}>
              {s.cancel}
            </Button>
          </div>
        ) : null}
      </div>
      {canEdit && !isRenaming && course.archived && onUnarchive ? (
        <Button variant="tertiary" aria-label={s.unarchiveLabel(course.name)} onClick={onUnarchive}>
          {s.unarchive}
        </Button>
      ) : null}
      {canEdit && !isRenaming && !course.archived ? (
        <Menu
          label={s.actionsLabel(course.name)}
          items={courseActions(course).map((a) => ({
            id: a.id,
            label: a.label,
            tone: a.tone,
            disabled: a.disabled,
            onSelect: () => {
              if (!a.disabled) onAction(a.id)
            },
          }))}
        />
      ) : null}
    </li>
  )
}

// One row of Settings > Courses. STUB (CRS D2 design step).
import type { ReactNode } from 'react'
import type { Course } from '../../../lib/courses'
import type { SortableRenderContext } from '../../../ui'
import type { CourseAction } from '../lib/courseList'

export interface CourseRowProps {
  course: Course
  /** From the Sortable of the list (an Admin's active Courses); without it the row has no drag handle and is a plain `li`. */
  sortable?: SortableRenderContext
  /** An Admin: the actions menu is there. A plain User sees the row read-only. */
  canEdit: boolean
  /** Inline rename is open: a TextField "Rename <name>" with Save and Cancel replaces the name. */
  renaming?: { value: string; error?: string; busy?: boolean }
  onRenameChange?: (value: string) => void
  onRenameSave?: () => void
  onRenameCancel?: () => void
  onAction?: (action: CourseAction['id']) => void
  /** An archived row shows "Unarchive" instead of the menu. */
  onUnarchive?: () => void
}

export function CourseRow(_props: CourseRowProps): ReactNode {
  return null
}

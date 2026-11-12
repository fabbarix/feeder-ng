import type { ReactNode } from 'react'
import type { CourseMenuEntry } from '../lib/timeline'

export interface CourseMenuProps {
  entries: CourseMenuEntry[]
  onCooked: (courseId: number) => void
  onNotCooked: (courseId: number) => void
}

/**
 * STUB (CRS F). The Course menu of the Cook Mode header: the shared `Menu` (ui) labelled "Course actions", one item per
 * entry ("Mark Side as Cooked", "Not cooked: Side"); choosing calls onCooked or onNotCooked with the Course id.
 * Renders nothing without entries.
 */
export function CourseMenu(_props: CourseMenuProps): ReactNode {
  return null
}

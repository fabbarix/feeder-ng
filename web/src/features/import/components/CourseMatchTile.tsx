import type { ReactNode } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import type { CourseMatch } from '../types'

export interface CourseMatchTileProps {
  match: CourseMatch
  /** Names of the Recipes that use the name (lib/courseRows.usedByRecipes). */
  usedBy: readonly string[]
  /** The active Courses the name can stand for, household order. */
  courses: readonly CourseChoice[]
  /** Only an Admin is offered "Add as a Course" and "Unarchive". */
  isAdmin: boolean
  onUse: (courseId: number) => void
  onSkip: () => void
  onAdd: () => void
  onUnarchive: () => void
}

/** CRS E2: one unknown or archived Course name of the file, with its answers (docs/dev/design/crs-e2.md 4.3). */
export function CourseMatchTile(_props: CourseMatchTileProps): ReactNode {
  return null
}

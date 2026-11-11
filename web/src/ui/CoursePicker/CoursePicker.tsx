import type { ReactNode } from 'react'
import type { CourseChoice } from '../../lib/courses'

/** What a row of the ordered picker gets to render its extra controls (D2: optional, attendance). */
export interface CoursePickerRowContext {
  course: CourseChoice
  /** Position in the chosen list, 0-based. */
  index: number
  /** How many Courses are chosen. */
  count: number
}

export interface CoursePickerProps {
  /** The visible group label ("Courses"); also the group's accessible name. */
  label: string
  /** The household's active Courses in household order. */
  courses: readonly CourseChoice[]
  /** Chosen Course ids. Ordered form: the Meal Slot's order. Unordered form: any order in, household order out. */
  value: readonly number[]
  onChange: (ids: number[]) => void
  /** Default true: the chosen Courses are also listed in their own order, with drag, Move up, Move down and Remove. */
  ordered?: boolean
  /** Default true: an empty choice shows "Choose at least one Course". */
  required?: boolean
  disabled?: boolean
  helper?: string
  /** Replaces the built-in "Choose at least one Course" message. */
  error?: string
  /**
   * Ordered form only: extra controls on each chosen row, after the name and before Move up (D2 adds "Optional" and the
   * attendance default here). Called once per row; never called by the unordered form.
   */
  renderRowExtras?: (row: CoursePickerRowContext) => ReactNode
}

/** An ordered picker of Courses: toggle chips in household order, and (ordered form) the chosen list in the slot's order. */
export function CoursePicker(_props: CoursePickerProps): ReactNode {
  throw new Error('not implemented')
}

// The state of the Delete / Archive dialog of a Course. STUB (CRS D2 design step).
import type { Course, CourseChoice, CourseImpact } from '../../../lib/courses'
import type { CoursesState } from '../../../lib/courses/useCourses'
import type { RemovalMode } from '../lib/courseRemoval'

export interface CourseRemovalState {
  /** The Course the dialog is about; null while it is closed. */
  course: Course | null
  mode: RemovalMode
  impact: CourseImpact | undefined
  /** The impact is being fetched. */
  loading: boolean
  loadFailed: boolean
  /** The Courses a replacement can be (active, not the Course itself). */
  choices: CourseChoice[]
  replacementId: number | null
  setReplacementId: (id: number) => void
  /** Some Recipe or Meal Slot has only this Course: the replacement is shown and sent. */
  needsReplacement: boolean
  busy: boolean
  error: string | undefined
  open: (course: Course) => void
  close: () => void
  /** Delete (mode delete) or Archive (mode archive); success closes and calls the hook's `onDone`. */
  confirm: () => Promise<void>
}

export function useCourseRemoval(_courses: CoursesState, _onDone?: (done: { mode: RemovalMode; course: Course }) => void): CourseRemovalState {
  throw new Error('not implemented')
}

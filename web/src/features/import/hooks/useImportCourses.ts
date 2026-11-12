import type { CourseChoice } from '../../../lib/courses'

export interface UseImportCourses {
  /** The active Courses, household order (react-query ['courses'], refetched on a household `courses` event). */
  courses: CourseChoice[]
  isAdmin: boolean
  isPending: boolean
}

/** CRS E2: the Courses an Import Review row can be answered with, and whether the User may add or unarchive one. */
export function useImportCourses(): UseImportCourses {
  throw new Error('not implemented')
}

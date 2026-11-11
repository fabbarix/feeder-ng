// The Courses query and its writes (react-query). STUB (CRS D2 design step). Not exported from the pure barrel index.ts.
import type { Course, CourseChoice, CourseImpact } from './types'

export interface UseCoursesOptions {
  /** Ask for archived Courses too (`?archived=1`): only Settings > Courses does. Default false. */
  includeArchived?: boolean
}

export interface CoursesState {
  /** As served: household order, archived ones last when asked for. */
  courses: Course[]
  /** Not archived, household order. */
  active: Course[]
  archived: Course[]
  /** The active Courses as picker choices. */
  choices: CourseChoice[]
  main: Course | undefined
  isPending: boolean
  isError: boolean
  add: (name: string) => Promise<Course>
  rename: (id: number, name: string) => Promise<Course>
  makeMain: (id: number) => Promise<Course>
  /** The new order of every active Course. */
  reorder: (ids: number[]) => Promise<Course[]>
  loadImpact: (id: number) => Promise<CourseImpact>
  remove: (id: number, replacement?: number) => Promise<void>
  archive: (id: number, replacementId?: number) => Promise<Course>
  unarchive: (id: number) => Promise<Course>
  /** True while any write is in flight. */
  saving: boolean
}

export function useCourses(_options: UseCoursesOptions = {}): CoursesState {
  throw new Error('not implemented')
}

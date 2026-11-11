// Typed calls for the Courses routes (functional-spec section 16). STUB (CRS D2 design step): the developer writes the bodies.
import type { Course, CourseImpact } from './types'

const notImplemented = (): never => {
  throw new Error('not implemented')
}

export const coursesApi = {
  /** `GET /api/courses` (`?archived=1` when `includeArchived`), unwrapped from `{ courses }`. */
  list: (_includeArchived: boolean): Promise<Course[]> => notImplemented(),
  /** `POST /api/courses` `{ name }`. */
  create: (_name: string): Promise<Course> => notImplemented(),
  /** `PATCH /api/courses/{id}` with `name` and/or `main: true`. */
  update: (_id: number, _patch: { name?: string; main?: true }): Promise<Course> => notImplemented(),
  /** `PUT /api/courses/order` `{ ids }`: every active Course once. */
  reorder: (_ids: number[]): Promise<Course[]> => notImplemented(),
  /** `GET /api/courses/{id}/impact`. */
  impact: (_id: number): Promise<CourseImpact> => notImplemented(),
  /** `DELETE /api/courses/{id}` with `?replacement=<id>` only when one is given. */
  remove: (_id: number, _replacement?: number): Promise<void> => notImplemented(),
  /** `POST /api/courses/{id}/archive` `{ replacementId }`, the key left out when none is given. */
  archive: (_id: number, _replacementId?: number): Promise<Course> => notImplemented(),
  /** `POST /api/courses/{id}/unarchive`. */
  unarchive: (_id: number): Promise<Course> => notImplemented(),
}

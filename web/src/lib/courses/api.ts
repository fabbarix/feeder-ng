// Typed calls for the Courses routes (functional-spec section 16).
import { http } from '../http'
import type { Course, CourseImpact } from './types'

export const coursesApi = {
  /** `GET /api/courses` (`?archived=1` when `includeArchived`), unwrapped from `{ courses }`. */
  list: (includeArchived: boolean): Promise<Course[]> =>
    http
      .get<{ courses: Course[] }>(includeArchived ? '/api/courses?archived=1' : '/api/courses')
      .then((r) => r.courses),
  /** `POST /api/courses` `{ name }`. */
  create: (name: string): Promise<Course> => http.post<Course>('/api/courses', { name }),
  /** `PATCH /api/courses/{id}` with `name` and/or `main: true`. */
  update: (id: number, patch: { name?: string; main?: true }): Promise<Course> =>
    http.patch<Course>(`/api/courses/${id}`, patch),
  /** `PUT /api/courses/order` `{ ids }`: every active Course once. */
  reorder: (ids: number[]): Promise<Course[]> =>
    http.put<{ courses: Course[] } | Course[]>('/api/courses/order', { ids }).then((r) => (Array.isArray(r) ? r : r.courses)),
  /** `GET /api/courses/{id}/impact`. */
  impact: (id: number): Promise<CourseImpact> => http.get<CourseImpact>(`/api/courses/${id}/impact`),
  /** `DELETE /api/courses/{id}` with `?replacement=<id>` only when one is given. */
  remove: (id: number, replacement?: number): Promise<void> =>
    http.delete<void>(replacement === undefined ? `/api/courses/${id}` : `/api/courses/${id}?replacement=${replacement}`),
  /** `POST /api/courses/{id}/archive` `{ replacementId }`, the key left out when none is given. */
  archive: (id: number, replacementId?: number): Promise<Course> =>
    http.post<Course>(`/api/courses/${id}/archive`, replacementId === undefined ? {} : { replacementId }),
  /** `POST /api/courses/{id}/unarchive`. */
  unarchive: (id: number): Promise<Course> => http.post<Course>(`/api/courses/${id}/unarchive`),
}

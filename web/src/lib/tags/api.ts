// The Tag routes of spec 17, through the shared HTTP client.
import { http } from '../http'
import type { Tag, TagImpact, TagInput, TagPatch } from './types'

export const tagsApi = {
  /** GET /api/tags */
  list: (): Promise<Tag[]> => http.get<Tag[]>('/api/tags'),
  /** POST /api/tags */
  create: (body: TagInput): Promise<Tag> => http.post<Tag>('/api/tags', body),
  /** PATCH /api/tags/{id} */
  update: (id: number, body: TagPatch): Promise<Tag> => http.patch<Tag>(`/api/tags/${id}`, body),
  /** GET /api/tags/{id}/impact */
  impact: (id: number): Promise<TagImpact> => http.get<TagImpact>(`/api/tags/${id}/impact`),
  /** POST /api/tags/{id}/merge, answers the Tag merged into */
  merge: (id: number, into: number): Promise<Tag> => http.post<Tag>(`/api/tags/${id}/merge`, { into }),
  /** DELETE /api/tags/{id} */
  remove: (id: number): Promise<void> => http.delete<void>(`/api/tags/${id}`),
}

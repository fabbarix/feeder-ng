// The Tag routes of spec 17.
import type { Tag, TagImpact, TagInput, TagPatch } from './types'

const unimplemented = (): never => {
  throw new Error('TG-UI: not implemented')
}

export const tagsApi = {
  /** GET /api/tags */
  list: (): Promise<Tag[]> => unimplemented(),
  /** POST /api/tags */
  create: (body: TagInput): Promise<Tag> => (void body, unimplemented()),
  /** PATCH /api/tags/{id} */
  update: (id: number, body: TagPatch): Promise<Tag> => (void id, void body, unimplemented()),
  /** GET /api/tags/{id}/impact */
  impact: (id: number): Promise<TagImpact> => (void id, unimplemented()),
  /** POST /api/tags/{id}/merge, answers the Tag merged into */
  merge: (id: number, into: number): Promise<Tag> => (void id, void into, unimplemented()),
  /** DELETE /api/tags/{id} */
  remove: (id: number): Promise<void> => (void id, unimplemented()),
}

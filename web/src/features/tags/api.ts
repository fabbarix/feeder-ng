// tagMergeApi.impactInto: GET /api/tags/{id}/impact?into=<id> (tg-api.md), which lib/tags/api.ts does not wrap.
import { http } from '../../lib/http'
import type { MergeImpact } from './types'

export const tagMergeApi = {
  /** GET /api/tags/{id}/impact?into=<id>: the Tag's impact plus `bothRecipes`. */
  impactInto: (id: number, into: number): Promise<MergeImpact> => http.get<MergeImpact>(`/api/tags/${id}/impact?into=${into}`),
}

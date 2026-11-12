// The one Tag route lib/tags does not wrap: the merge impact with `?into=` (tg-api.md). Plain TypeScript, no React.
import type { MergeImpact } from './types'

export const tagMergeApi = {
  /** GET /api/tags/{id}/impact?into=<id>: the Tag's impact plus `bothRecipes`. */
  impactInto: (_id: number, _into: number): Promise<MergeImpact> => {
    throw new Error('TG-S: not implemented')
  },
}

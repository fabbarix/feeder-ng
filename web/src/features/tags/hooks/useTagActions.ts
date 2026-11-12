// The Tag writes and the two summaries the confirms need. Every successful write calls invalidateTagCaches.
import type { DeleteSummary, MergeSummary, Tag, TagInput, TagPatch } from '../../../lib/tags'

export interface TagActions {
  create: (input: TagInput) => Promise<Tag>
  update: (id: number, patch: TagPatch) => Promise<Tag>
  merge: (id: number, into: number) => Promise<Tag>
  remove: (id: number) => Promise<void>
  /** GET impact?into=<target> and GET impact of the target, in parallel, folded by mergeSummary with bothRecipes (0 when absent). */
  mergeSummaryFor: (source: Pick<Tag, 'id' | 'name'>, target: Pick<Tag, 'id' | 'name'>) => Promise<MergeSummary>
  /** GET impact, folded by deleteSummary. */
  deleteSummaryFor: (tag: Pick<Tag, 'id' | 'name'>) => Promise<DeleteSummary>
}

export function useTagActions(): TagActions {
  throw new Error('TG-S: not implemented')
}

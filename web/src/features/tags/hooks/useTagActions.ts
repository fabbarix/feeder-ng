// The Tag writes and the two summaries the confirms need. Every successful write calls invalidateTagCaches.
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { invalidateTagCaches, mergeSummary, deleteSummary, tagsApi, type DeleteSummary, type MergeSummary, type Tag, type TagInput, type TagPatch } from '../../../lib/tags'
import { tagMergeApi } from '../api'

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
  const client = useQueryClient()
  return useMemo(() => {
    const written = async <T,>(write: Promise<T>): Promise<T> => {
      const result = await write
      await invalidateTagCaches(client)
      return result
    }
    return {
      create: (input) => written(tagsApi.create(input)),
      update: (id, patch) => written(tagsApi.update(id, patch)),
      merge: (id, into) => written(tagsApi.merge(id, into)),
      remove: (id) => written(tagsApi.remove(id)),
      mergeSummaryFor: async (source, target) => {
        const [sourceImpact, targetImpact] = await Promise.all([tagMergeApi.impactInto(source.id, target.id), tagsApi.impact(target.id)])
        return mergeSummary({ source, target, sourceImpact, targetImpact, bothRecipes: sourceImpact.bothRecipes ?? 0 })
      },
      deleteSummaryFor: async (tag) => deleteSummary({ tag, impact: await tagsApi.impact(tag.id) }),
    }
  }, [client])
}

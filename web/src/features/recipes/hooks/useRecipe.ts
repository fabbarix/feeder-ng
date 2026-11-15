import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { recipesApi } from '../api'
import type { Recipe, RecipeSummary } from '../types'
import { useRecipeLiveUpdates } from './useRecipeLiveUpdates'

export interface UseRecipe {
  /** B9-20 (RES-02): loading, ready, offlineSaved, offlineUnknown or failed (a 404 is failed after one request). */
  state: ScreenState
  recipe: Recipe | undefined
  /** The Recipe's name from a loaded list, while the Recipe itself is not known (the LoadState keeps the title). */
  knownName: string | undefined
  isLoading: boolean
  error: Error | null
  /** Fetches the Recipe again (the error state's Try again). */
  refetch: () => void
  /** Archive / unarchive; refreshes ['recipes'] and ['recipes', id]. */
  setArchived: (archived: boolean) => Promise<void>
  /** Hard delete. Rejects with ApiError code 'already_planned' when the Recipe was ever planned. */
  remove: () => Promise<void>
}

export function useRecipe(id: number): UseRecipe {
  useRecipeLiveUpdates()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['recipes', id], queryFn: () => recipesApi.get(id) })
  const archive = useMutation({
    mutationFn: (archived: boolean) => (archived ? recipesApi.archive(id) : recipesApi.unarchive(id)),
    onSuccess: () => client.invalidateQueries({ queryKey: ['recipes'] }),
  })
  const remove = useMutation({
    mutationFn: () => recipesApi.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recipes'] })
      void client.invalidateQueries({ queryKey: ['tags'] })
    },
  })
  const state = useScreenState(query, { isEmpty: false, hasFilter: false })
  return {
    state,
    recipe: query.data,
    knownName: query.data?.name ?? nameFromLists(client.getQueriesData<RecipeSummary[]>({ queryKey: ['recipes'] }), id),
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch()
    },
    setArchived: async (archived) => {
      await archive.mutateAsync(archived)
    },
    remove: async () => {
      await remove.mutateAsync()
    },
  }
}

/** The name of Recipe `id` in any cached Recipes list (['recipes', filter] holds arrays; ['recipes', id] does not). */
function nameFromLists(entries: Array<[unknown, RecipeSummary[] | undefined]>, id: number): string | undefined {
  for (const [, data] of entries) {
    if (!Array.isArray(data)) continue
    const hit = data.find((r) => r.id === id)
    if (hit) return hit.name
  }
  return undefined
}

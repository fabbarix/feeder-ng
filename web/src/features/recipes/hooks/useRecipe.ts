import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { recipesApi } from '../api'
import type { Recipe } from '../types'
import { useRecipeLiveUpdates } from './useRecipeLiveUpdates'

export interface UseRecipe {
  recipe: Recipe | undefined
  isLoading: boolean
  error: Error | null
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
  return {
    recipe: query.data,
    isLoading: query.isLoading,
    error: query.error,
    setArchived: async (archived) => {
      await archive.mutateAsync(archived)
    },
    remove: async () => {
      await remove.mutateAsync()
    },
  }
}

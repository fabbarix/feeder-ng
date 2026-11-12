import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recipesApi } from '../api'
import { sortRecipes } from '../lib/sort'
import type { RecipeFilter, RecipeSummary, TagCount } from '../types'
import { useRecipeLiveUpdates } from './useRecipeLiveUpdates'

export interface UseRecipes {
  recipes: RecipeSummary[]
  tags: TagCount[]
  /** True when there are no Recipes at all (not just no match). */
  isEmpty: boolean
  isLoading: boolean
  error: Error | null
  /** Refetches the list (the error state's retry). */
  refetch: () => void
}

/** react-query ['recipes', filter] and ['tags']. Live: the SPA invalidates on SSE topic `recipes`. */
export function useRecipes(filter: RecipeFilter): UseRecipes {
  useRecipeLiveUpdates()
  const list = useQuery({ queryKey: ['recipes', filter], queryFn: () => recipesApi.list(filter) })
  const tags = useQuery({ queryKey: ['tags'], queryFn: recipesApi.tags })
  const filtered = Boolean(filter.q || filter.tag || filter.course !== undefined || (filter.archived && filter.archived !== 'no'))
  // The server sorts too; sorting again keeps the order right when a live update changes a date.
  const sort = filter.sort
  const recipes = useMemo(() => (list.data === undefined ? [] : sort ? sortRecipes(list.data, sort) : list.data), [list.data, sort])
  return {
    recipes,
    tags: tags.data ?? [],
    isEmpty: list.isSuccess && list.data.length === 0 && !filtered,
    isLoading: list.isLoading,
    error: list.error,
    refetch: () => void list.refetch(),
  }
}

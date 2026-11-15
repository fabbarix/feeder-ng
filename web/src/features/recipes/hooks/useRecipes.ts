import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { recipesApi } from '../api'
import { sortRecipes } from '../lib/sort'
import { timeSummary } from '../lib/timeSummary'
import { distinctNames } from '../../../lib/distinctNames'
import type { RecipeFilter, RecipeSummary, TagCount } from '../types'
import { useRecipeLiveUpdates } from './useRecipeLiveUpdates'

export interface UseRecipes {
  /** B9-20 (RES-02): which of the seven screen states the list is in. */
  state: ScreenState
  recipes: RecipeSummary[]
  tags: TagCount[]
  /** True when there are no Recipes at all (not just no match): `state === 'empty'`. */
  isEmpty: boolean
  isLoading: boolean
  error: Error | null
  /** Refetches the list (the error state's retry). */
  refetch: () => void
  /** B9-55 (P38): each tile's accessible name; two Recipes of one name add their time (or their place among them). */
  tileNames?: Map<number, string>
}

/** react-query ['recipes', filter] and ['tags']. Live: the SPA invalidates on SSE topic `recipes`. */
export function useRecipes(filter: RecipeFilter): UseRecipes {
  useRecipeLiveUpdates()
  const list = useQuery({ queryKey: ['recipes', filter], queryFn: () => recipesApi.list(filter) })
  const tags = useQuery({ queryKey: ['tags'], queryFn: recipesApi.tags })
  const filtered = Boolean(filter.q || filter.tags?.length || filter.course !== undefined || (filter.archived && filter.archived !== 'no'))
  // The server sorts too; sorting again keeps the order right when a live update changes a date.
  const sort = filter.sort
  const recipes = useMemo(() => (list.data === undefined ? [] : sort ? sortRecipes(list.data, sort) : list.data), [list.data, sort])
  const tileNames = useMemo(() => distinctNames(recipes, (r) => timeSummary(r).total ?? undefined), [recipes])
  const state = useScreenState(list, { isEmpty: list.data?.length === 0, hasFilter: filtered })
  return {
    state,
    recipes,
    tags: tags.data ?? [],
    isEmpty: state === 'empty',
    isLoading: list.isLoading,
    error: list.error,
    refetch: () => void list.refetch(),
    tileNames,
  }
}

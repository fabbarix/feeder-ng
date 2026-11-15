import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { ingredientsApi } from '../api'
import { filterIngredients } from '../lib/names'
import type { Ingredient, IngredientKind, NewIngredient } from '../types'

export interface UseIngredients {
  /** B9-20 (RES-02): which of the seven screen states the list is in (filteredEmpty: no row matches the search). */
  state: ScreenState
  /** Filtered by `query` with filterIngredients, ordered by name. */
  ingredients: Ingredient[]
  /** True when the Household has no Ingredients at all (distinguishes "none yet" from "no match"). */
  isEmpty: boolean
  isLoading: boolean
  error: Error | null
  /** Fetches the list again (the error state's Try again). */
  refetch: () => void
  /** Creates and refreshes the list. Rejects with ApiError (code 'name_taken', 'invalid_ingredient'). */
  create: (body: NewIngredient) => Promise<Ingredient>
}

/**
 * The Ingredient list of one kind (react-query key ['ingredients', 'list', kind], so food and Supplies never share a cache entry)
 * and the create mutation. Food by default (H5, decision D5: /ingredients is food only).
 */
export function useIngredients(query: string, kind: IngredientKind = 'food'): UseIngredients {
  const client = useQueryClient()
  const list = useQuery({ queryKey: ['ingredients', 'list', kind], queryFn: () => ingredientsApi.list(undefined, kind) })
  const all = useMemo(() => list.data ?? [], [list.data])
  const ingredients = useMemo(() => filterIngredients(all, query), [all, query])

  const createMutation = useMutation({
    mutationFn: (body: NewIngredient) => ingredientsApi.create(body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['ingredients'] }),
  })

  // filteredEmpty when Ingredients exist but none matches the search; empty only when there are none at all.
  const state = useScreenState(list, { isEmpty: list.data !== undefined && ingredients.length === 0, hasFilter: all.length > 0 })
  return {
    state,
    ingredients,
    isEmpty: state === 'empty',
    isLoading: list.isLoading,
    error: list.error,
    refetch: () => void list.refetch(),
    create: (body) => createMutation.mutateAsync(body),
  }
}

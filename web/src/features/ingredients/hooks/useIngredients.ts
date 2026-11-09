import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ingredientsApi } from '../api'
import { filterIngredients } from '../lib/names'
import type { Ingredient, NewIngredient } from '../types'

export interface UseIngredients {
  /** Filtered by `query` with filterIngredients, ordered by name. */
  ingredients: Ingredient[]
  /** True when the Household has no Ingredients at all (distinguishes "none yet" from "no match"). */
  isEmpty: boolean
  isLoading: boolean
  error: Error | null
  /** Creates and refreshes the list. Rejects with ApiError (code 'name_taken', 'invalid_ingredient'). */
  create: (body: NewIngredient) => Promise<Ingredient>
}

/** The Ingredient list query (react-query key ['ingredients']) and create mutation. */
export function useIngredients(query: string): UseIngredients {
  const client = useQueryClient()
  const list = useQuery({ queryKey: ['ingredients'], queryFn: () => ingredientsApi.list() })
  const all = useMemo(() => list.data ?? [], [list.data])
  const ingredients = useMemo(() => filterIngredients(all, query), [all, query])

  const createMutation = useMutation({
    mutationFn: (body: NewIngredient) => ingredientsApi.create(body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['ingredients'] }),
  })

  return {
    ingredients,
    isEmpty: list.isSuccess && all.length === 0,
    isLoading: list.isLoading,
    error: list.error,
    create: (body) => createMutation.mutateAsync(body),
  }
}

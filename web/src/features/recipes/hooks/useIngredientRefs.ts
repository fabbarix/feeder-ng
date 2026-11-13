import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { recipesApi } from '../api'
import type { IngredientRef } from '../types'

export interface UseIngredientRefs {
  /** Every Ingredient by id, with its Base Unit and Unit Conversions. */
  byId: ReadonlyMap<number, IngredientRef>
  isLoading: boolean
}

/** Food only (H5: a Supply is never a Recipe line). Shares the food list's cache entry, react-query ['ingredients', 'list', 'food']. */
export function useIngredientRefs(): UseIngredientRefs {
  const query = useQuery({ queryKey: ['ingredients', 'list', 'food'], queryFn: recipesApi.ingredients })
  const byId = useMemo(() => new Map((query.data ?? []).map((ing) => [ing.id, ing] as const)), [query.data])
  return { byId, isLoading: query.isLoading }
}

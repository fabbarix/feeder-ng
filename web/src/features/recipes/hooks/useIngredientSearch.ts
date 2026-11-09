import { useQuery } from '@tanstack/react-query'
import { recipesApi } from '../api'
import type { IngredientRef } from '../types'

/** Ingredient suggestions for the line picker; empty until something is typed. */
export function useIngredientSearch(text: string): IngredientRef[] {
  const q = text.trim()
  const query = useQuery({
    queryKey: ['ingredient-search', q],
    queryFn: () => recipesApi.findIngredients(q),
    enabled: q !== '',
  })
  return q === '' ? [] : (query.data ?? [])
}

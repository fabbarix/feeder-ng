import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ingredientsApi } from '../../ingredients/api'
import { displayName } from '../../ingredients/lib/names'
import type { BaseUnit } from '../types'
import type { ProductIngredient } from './useProductForm'

/** SET-14a: every Ingredient, food and Supplies (GET /api/ingredients with no kind), for the New Product sheet's Ingredient Select. */
export function useIngredientChoices(): { ingredients: (ProductIngredient & { label: string; imageUrl?: string })[]; isLoading: boolean } {
  const query = useQuery({ queryKey: ['ingredients'], queryFn: () => ingredientsApi.list() })
  const ingredients = useMemo(
    () => (query.data ?? []).map((i) => ({ id: i.id, name: i.name, label: displayName(i.name), baseUnit: i.baseUnit as BaseUnit, imageUrl: i.imageUrl })),
    [query.data],
  )
  return { ingredients, isLoading: query.isLoading }
}

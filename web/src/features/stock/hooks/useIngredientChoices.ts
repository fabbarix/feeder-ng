import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ingredientsApi } from '../../ingredients/api'
import type { IngredientChoice } from '../types'

/** Ingredients to pick from when adding a Stock Lot (GET /api/ingredients, team T2), by name. */
export function useIngredientChoices(): { choices: IngredientChoice[]; isLoading: boolean } {
  const list = useQuery({ queryKey: ['ingredients'], queryFn: () => ingredientsApi.list() })
  const choices = useMemo(
    () =>
      (list.data ?? [])
        .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [list.data],
  )
  return { choices, isLoading: list.isLoading }
}

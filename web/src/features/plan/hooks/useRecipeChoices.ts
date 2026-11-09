import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { RecipeChoice } from '../types'

const NONE: RecipeChoice[] = []

/** Recipes to choose from when setting a meal or a Slot Rule; idle while not enabled. */
export function useRecipeChoices(enabled = true): { recipes: RecipeChoice[]; isLoading: boolean } {
  const q = useQuery({ queryKey: ['plan', 'recipe-choices'], queryFn: planApi.recipeChoices, enabled })
  return { recipes: q.data ?? NONE, isLoading: enabled && q.isLoading }
}

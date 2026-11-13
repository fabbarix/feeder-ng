import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { RecipeChoice } from '../types'

const NONE: RecipeChoice[] = []

/**
 * Recipes to choose from when setting a meal or a Slot Rule; idle while not enabled. CRS F: with a courseId only the
 * Recipes marked with that Course (Add <Course>, a Slot Rule's Course): the server's `?course=`.
 */
export function useRecipeChoices(enabled = true, courseId?: number): { recipes: RecipeChoice[]; isLoading: boolean } {
  const q = useQuery({ queryKey: ['plan', 'recipe-choices', courseId ?? null], queryFn: () => planApi.recipeChoices(courseId), enabled })
  return { recipes: q.data ?? NONE, isLoading: enabled && q.isLoading }
}

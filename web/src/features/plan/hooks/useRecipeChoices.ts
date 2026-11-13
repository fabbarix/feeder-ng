import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { RecipeChoice } from '../types'

const NONE: RecipeChoice[] = []

/**
 * Recipes to choose from when setting a meal or a Slot Rule; idle while not enabled. CRS F: with a courseId only the
 * Recipes marked with that Course (Add <Course>, a Slot Rule's Course). If that list cannot be read, every Recipe is read
 * instead and the ones marked with the Course are kept, so the chooser still works.
 */
export function useRecipeChoices(enabled = true, courseId?: number): { recipes: RecipeChoice[]; isLoading: boolean } {
  const q = useQuery({ queryKey: ['plan', 'recipe-choices', courseId ?? null], queryFn: () => planApi.recipeChoices(courseId), enabled })
  const fallback = useQuery({
    queryKey: ['plan', 'recipe-choices', null],
    queryFn: () => planApi.recipeChoices(),
    enabled: enabled && courseId !== undefined && q.isError,
  })
  if (q.data) return { recipes: q.data, isLoading: enabled && q.isLoading }
  const marked = courseId === undefined ? NONE : (fallback.data ?? NONE).filter((r) => (r.courseIds ?? []).includes(courseId))
  return { recipes: marked, isLoading: enabled && (q.isLoading || (q.isError && fallback.isLoading)) }
}

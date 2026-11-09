import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import { isExcluded, nextState, stateOf } from '../lib/preference'
import type { MemberPreferences, PreferenceState } from '../types'

export interface UseRecipePreferences {
  /** Current state of a Recipe for the chosen Member (default: the signed-in User's linked Member). */
  stateOf: (recipeId: number) => PreferenceState
  isExcluded: (ingredientId: number) => boolean
  /** Applies nextState(current, tapped) and saves; optimistic, rolled back on error. */
  toggleRecipe: (recipeId: number, tapped: Exclude<PreferenceState, 'none'>) => Promise<void>
  toggleIngredient: (ingredientId: number) => Promise<void>
  /** True when the User has no linked Member and no memberId was given (the toggles are hidden). */
  noMember: boolean
  isLoading: boolean
}

/** react-query ['recipe-preferences', memberId ?? 'me']. */
export function useRecipePreferences(memberId?: number): UseRecipePreferences {
  const client = useQueryClient()
  const key = ['recipe-preferences', memberId ?? 'me']
  const query = useQuery({
    queryKey: key,
    queryFn: () => recipesApi.preferences(memberId),
    retry: (count, err) => !(err instanceof ApiError) && count < 2,
  })
  const data = query.data

  /** Shows the change at once, saves it, and restores the previous value when the save fails. */
  const commit = async (
    optimistic: (prev: MemberPreferences) => MemberPreferences,
    send: () => Promise<MemberPreferences>,
  ) => {
    const previous = client.getQueryData<MemberPreferences>(key)
    if (previous) client.setQueryData(key, optimistic(previous))
    try {
      client.setQueryData(key, await send())
    } catch (err) {
      if (previous) client.setQueryData(key, previous)
      throw err
    }
  }

  return {
    stateOf: (recipeId) => (data ? stateOf(data.recipes, recipeId) : 'none'),
    isExcluded: (ingredientId) => (data ? isExcluded(data.excludedIngredients, ingredientId) : false),
    toggleRecipe: async (recipeId, tapped) => {
      if (!data) return
      const next = nextState(stateOf(data.recipes, recipeId), tapped)
      await commit(
        (prev) => {
          const recipes = { ...prev.recipes }
          if (next === 'none') delete recipes[String(recipeId)]
          else recipes[String(recipeId)] = next
          return { ...prev, recipes }
        },
        () => recipesApi.setRecipeState(recipeId, next, memberId),
      )
    },
    toggleIngredient: async (ingredientId) => {
      if (!data) return
      const excluded = !isExcluded(data.excludedIngredients, ingredientId)
      await commit(
        (prev) => ({
          ...prev,
          excludedIngredients: excluded
            ? [...prev.excludedIngredients, ingredientId].sort((a, b) => a - b)
            : prev.excludedIngredients.filter((id) => id !== ingredientId),
        }),
        () => recipesApi.setIngredientExclusion(ingredientId, excluded, memberId),
      )
    },
    noMember: memberId === undefined && query.error instanceof ApiError && query.error.code === 'no_member',
    isLoading: query.isLoading,
  }
}

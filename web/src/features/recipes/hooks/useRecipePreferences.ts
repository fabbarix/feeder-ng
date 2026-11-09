import type { PreferenceState } from '../types'

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
export function useRecipePreferences(_memberId?: number): UseRecipePreferences {
  throw new Error('TODO')
}

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
  void query
  throw new Error('TODO')
}

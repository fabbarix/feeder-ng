import type { IngredientChoice } from '../types'

/** Ingredients to pick from when adding a Stock Lot (GET /api/ingredients, team T2). */
export function useIngredientChoices(): { choices: IngredientChoice[]; isLoading: boolean } {
  throw new Error('TODO')
}

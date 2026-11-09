import type { PreferenceState } from '../types'

/**
 * What tapping a preference toggle does: tapping the current state clears it ('none'); tapping another
 * state replaces it (a Member has one state per Recipe).
 */
export function nextState(_current: PreferenceState, _tapped: Exclude<PreferenceState, 'none'>): PreferenceState {
  throw new Error('TODO')
}

/** State of a Recipe in a Member's preferences ('none' when absent). */
export function stateOf(_recipes: Record<string, Exclude<PreferenceState, 'none'>>, _recipeId: number): PreferenceState {
  throw new Error('TODO')
}

/** True when the Ingredient is in the Member's excluded list. */
export function isExcluded(_excludedIngredients: number[], _ingredientId: number): boolean {
  throw new Error('TODO')
}

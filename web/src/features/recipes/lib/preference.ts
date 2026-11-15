import { recipeStrings } from '../strings'
import type { PreferenceState } from '../types'

/**
 * What tapping a preference toggle does: tapping the current state clears it ('none'); tapping another
 * state replaces it (a Member has one state per Recipe).
 */
export function nextState(current: PreferenceState, tapped: Exclude<PreferenceState, 'none'>): PreferenceState {
  return current === tapped ? 'none' : tapped
}

/** State of a Recipe in a Member's preferences ('none' when absent). */
export function stateOf(recipes: Record<string, Exclude<PreferenceState, 'none'>>, recipeId: number): PreferenceState {
  return recipes[String(recipeId)] ?? 'none'
}

/** True when the Ingredient is in the Member's excluded list. */
export function isExcluded(excludedIngredients: number[], ingredientId: number): boolean {
  return excludedIngredients.includes(ingredientId)
}

/** A11Y 3: "Ben excludes Flour.", "Ben and Chiara exclude Flour.", "Ben, Chiara and 2 more exclude Flour.", "Nobody excludes Flour." Names in the order given. */
export function exclusionSummary(names: readonly string[], ingredient: string): string {
  const t = recipeStrings.exclusionSummary
  const [a, b] = names
  if (a === undefined) return t.nobody(ingredient)
  if (b === undefined) return t.one(a, ingredient)
  if (names.length === 2) return t.two(a, b, ingredient)
  return t.many(a, b, names.length - 2, ingredient)
}

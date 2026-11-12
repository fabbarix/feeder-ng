// Beta.5 F7: the Recipes list sort (reconcile 7.3, Q24). Plain TypeScript, no React. Stubs until implemented.
import type { RecipeSummary } from '../types'

export type RecipeSort = 'name' | 'last_cooked_asc' | 'last_cooked_desc'

/** The sorts in the order the select lists them; the first is the default. */
export const RECIPE_SORTS: readonly RecipeSort[] = ['name', 'last_cooked_asc', 'last_cooked_desc']

export const DEFAULT_RECIPE_SORT: RecipeSort = 'name'

/** A known sort from a raw value (a URL parameter, a stored string); anything else (null, '', 'newest') is null. */
export function parseSort(_raw: string | null | undefined): RecipeSort | null {
  return 'name'
}

/** The sort in force: the URL's when valid, else the remembered one when valid, else 'name'. */
export function resolveSort(_fromUrl: string | null, _remembered: string | null): RecipeSort {
  return 'name'
}

/**
 * Pure, same rule as the server's `?sort=`: 'name' = case-insensitive name then id; 'last_cooked_asc' = Recipes not
 * cooked yet first, then oldest `lastCookedOn` first; 'last_cooked_desc' = most recent first, not cooked yet last.
 * Ties by name (then id). Does not mutate its input.
 */
export function sortRecipes<T extends Pick<RecipeSummary, 'id' | 'name' | 'lastCookedOn'>>(list: readonly T[], _sort: RecipeSort): T[] {
  return [...list]
}

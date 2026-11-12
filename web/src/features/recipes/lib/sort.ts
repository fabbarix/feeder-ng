// Beta.5 F7: the Recipes list sort (reconcile 7.3, Q24). Plain TypeScript, no React.
import type { RecipeSummary } from '../types'

export type RecipeSort = 'name' | 'last_cooked_asc' | 'last_cooked_desc'

/** The sorts in the order the select lists them; the first is the default. */
export const RECIPE_SORTS: readonly RecipeSort[] = ['name', 'last_cooked_asc', 'last_cooked_desc']

export const DEFAULT_RECIPE_SORT: RecipeSort = 'name'

/** A known sort from a raw value (a URL parameter, a stored string); anything else (null, '', 'newest') is null. */
export function parseSort(raw: string | null | undefined): RecipeSort | null {
  return RECIPE_SORTS.find((s) => s === raw) ?? null
}

/** The sort in force: the URL's when valid, else the remembered one when valid, else 'name'. */
export function resolveSort(fromUrl: string | null, remembered: string | null): RecipeSort {
  return parseSort(fromUrl) ?? parseSort(remembered) ?? DEFAULT_RECIPE_SORT
}

function byName(a: { id: number; name: string }, b: { id: number; name: string }): number {
  const la = a.name.toLowerCase()
  const lb = b.name.toLowerCase()
  if (la !== lb) return la < lb ? -1 : 1
  return a.id - b.id
}

/**
 * Pure, same rule as the server's `?sort=`: 'name' = case-insensitive name then id; 'last_cooked_asc' = Recipes not
 * cooked yet first, then oldest `lastCookedOn` first; 'last_cooked_desc' = most recent first, not cooked yet last.
 * Ties by name (then id). Does not mutate its input.
 */
export function sortRecipes<T extends Pick<RecipeSummary, 'id' | 'name' | 'lastCookedOn'>>(list: readonly T[], sort: RecipeSort): T[] {
  const out = [...list]
  if (sort === 'name') return out.sort(byName)
  const asc = sort === 'last_cooked_asc'
  return out.sort((a, b) => {
    const da = a.lastCookedOn
    const db = b.lastCookedOn
    if (da === null || db === null) {
      if (da === db) return byName(a, b)
      // Not cooked yet goes first in the oldest-first order and last in the most-recent-first order.
      return (da === null) === asc ? -1 : 1
    }
    if (da !== db) return (da < db) === asc ? -1 : 1
    return byName(a, b)
  })
}

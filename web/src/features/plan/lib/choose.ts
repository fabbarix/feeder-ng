import type { RecipeChoice } from '../types'

/** The Recipes whose name contains the query, ignoring case and surrounding spaces; every Recipe for an empty query. */
export function matchRecipes(recipes: RecipeChoice[], query: string): RecipeChoice[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return recipes
  return recipes.filter((r) => r.name.toLowerCase().includes(needle))
}

/** The alternative's meta line: its first phrased reason and the Leftover it would leave, joined by " · " (may be empty). */
export function swapMeta(reason: string | undefined, extra: string): string | undefined {
  const parts = [reason, extra].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

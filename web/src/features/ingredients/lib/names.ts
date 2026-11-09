import type { Ingredient } from '../types'

/** Matching key of a name: lower case, trimmed, runs of whitespace collapsed. Mirrors units.NormalizeName in Go. */
export function normalizeName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase()
}

/** Ingredients whose normalised name contains the normalised query (all of them for a blank query), ordered by normalised name. */
export function filterIngredients(list: readonly Ingredient[], query: string): Ingredient[] {
  const key = normalizeName(query)
  return list
    .map((ingredient) => ({ ingredient, k: normalizeName(ingredient.name) }))
    .filter(({ k }) => k.includes(key))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map(({ ingredient }) => ingredient)
}

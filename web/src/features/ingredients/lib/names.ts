import type { Ingredient } from '../types'

/** Matching key of a name: lower case, trimmed, runs of whitespace collapsed. Mirrors units.NormalizeName in Go. */
export function normalizeName(name: string): string {
  void name
  throw new Error('TODO')
}

/** Ingredients whose normalised name contains the normalised query (all of them for a blank query), ordered by normalised name. */
export function filterIngredients(list: readonly Ingredient[], query: string): Ingredient[] {
  void list
  void query
  throw new Error('TODO')
}

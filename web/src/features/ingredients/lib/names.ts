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

/** WP11 (copy fix, section 6): the display form of a stored lower-case name, first letter capitalised ("garlic" -> "Garlic",
 *  "olive oil" -> "Olive oil"). Only the first character changes; blank input stays blank. */
export function displayName(name: string): string {
  const text = name.trimStart()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** WP11: the row meta of the Ingredients list: Base Unit label and, when set, "keeps N days" ("g · keeps 30 days", "ml"). */
export function ingredientMeta(baseUnitLabel: string, shelfLifeDays: number | null): string {
  if (shelfLifeDays === null) return baseUnitLabel
  return `${baseUnitLabel} · keeps ${shelfLifeDays} ${shelfLifeDays === 1 ? 'day' : 'days'}`
}

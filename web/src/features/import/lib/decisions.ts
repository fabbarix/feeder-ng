// Pure helpers that build the answers sent to the server. Every function returns a new object and leaves the input untouched.
import type { BaseUnit, ConversionAnswer, Decisions, IngredientDecision, RecipeAction, RecipeDecision } from './../types'

/** No answers yet. */
export function emptyDecisions(): Decisions {
  return { ingredients: [], conversions: [], recipes: [] }
}

/** Replaces the entry matching `same`, or appends `entry` when there is none. */
function upsert<T>(list: readonly T[], same: (x: T) => boolean, entry: T): T[] {
  return list.some(same) ? list.map((x) => (same(x) ? entry : x)) : [...list, entry]
}

/** Answer an Ingredient with an existing one. Replaces an earlier answer for the same key. */
export function chooseExisting(d: Decisions, key: string, ingredientId: number): Decisions {
  const answer: IngredientDecision = { key, action: 'use', ingredientId }
  return { ...d, ingredients: upsert(d.ingredients, (x) => x.key === key, answer) }
}

/** Answer an Ingredient with "create": optionally under a new name, and/or with a Base Unit (for an Ingredient the file does not define). Empty/blank name is left out. */
export function chooseCreate(d: Decisions, key: string, opts?: { name?: string; baseUnit?: BaseUnit }): Decisions {
  const answer: IngredientDecision = { key, action: 'create' }
  const name = opts?.name?.trim()
  if (name) answer.name = name
  if (opts?.baseUnit) answer.baseUnit = opts.baseUnit
  return { ...d, ingredients: upsert(d.ingredients, (x) => x.key === key, answer) }
}

/** Remove the answer for an Ingredient. */
export function clearIngredient(d: Decisions, key: string): Decisions {
  return { ...d, ingredients: d.ingredients.filter((x) => x.key !== key) }
}

/** Answer a unit prompt. The unit is trimmed and lower-cased; replaces an earlier answer for the same key + unit. */
export function answerConversion(d: Decisions, key: string, unit: string, toBase: number): Decisions {
  const u = unit.trim().toLowerCase()
  const answer: ConversionAnswer = { key, unit: u, toBase }
  return { ...d, conversions: upsert(d.conversions, (x) => x.key === key && x.unit === u, answer) }
}

/** Answer a Recipe conflict. Replaces an earlier answer for the same index. */
export function chooseRecipeAction(d: Decisions, index: number, action: RecipeAction): Decisions {
  const answer: RecipeDecision = { index, action }
  return { ...d, recipes: upsert(d.recipes, (x) => x.index === index, answer) }
}

/** Reads the amount typed for a Unit Conversion: a number above 0 (comma or point as decimal separator), else null. */
export function parseToBase(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?(e\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

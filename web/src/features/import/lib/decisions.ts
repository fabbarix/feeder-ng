// Pure helpers that build the answers sent to the server. Every function returns a new object and leaves the input untouched.
import type { BaseUnit, Decisions, RecipeAction } from './../types'

/** No answers yet. */
export function emptyDecisions(): Decisions {
  throw new Error('not implemented')
}

/** Answer an Ingredient with an existing one. Replaces an earlier answer for the same key. */
export function chooseExisting(d: Decisions, key: string, ingredientId: number): Decisions {
  void d; void key; void ingredientId
  throw new Error('not implemented')
}

/** Answer an Ingredient with "create": optionally under a new name, and/or with a Base Unit (for an Ingredient the file does not define). Empty/blank name is left out. */
export function chooseCreate(d: Decisions, key: string, opts?: { name?: string; baseUnit?: BaseUnit }): Decisions {
  void d; void key; void opts
  throw new Error('not implemented')
}

/** Remove the answer for an Ingredient. */
export function clearIngredient(d: Decisions, key: string): Decisions {
  void d; void key
  throw new Error('not implemented')
}

/** Answer a unit prompt. The unit is trimmed and lower-cased; replaces an earlier answer for the same key + unit. */
export function answerConversion(d: Decisions, key: string, unit: string, toBase: number): Decisions {
  void d; void key; void unit; void toBase
  throw new Error('not implemented')
}

/** Answer a Recipe conflict. Replaces an earlier answer for the same index. */
export function chooseRecipeAction(d: Decisions, index: number, action: RecipeAction): Decisions {
  void d; void index; void action
  throw new Error('not implemented')
}

/** Reads the amount typed for a Unit Conversion: a number above 0 (comma or point as decimal separator), else null. */
export function parseToBase(text: string): number | null {
  void text
  throw new Error('not implemented')
}

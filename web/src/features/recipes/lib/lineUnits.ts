import type { IngredientRef } from '../types'

/**
 * Units usable for an ingredient line, for the editor's unit picker and instant feedback.
 * Mirrors docs/spec/recipe-file.md (Units): the Base Unit, the global units of that Base Unit
 * (g: kg; ml: l, dl, cl, tsp, tbsp, cup; piece: none) and the Ingredient's own Unit Conversions.
 * The server (internal/units) has the last word.
 */
export function selectableUnits(_ingredient: IngredientRef): string[] {
  throw new Error('TODO')
}

/** True when `unit` (trimmed, case-insensitive) is one of selectableUnits. */
export function isKnownUnit(_unit: string, _ingredient: IngredientRef): boolean {
  throw new Error('TODO')
}

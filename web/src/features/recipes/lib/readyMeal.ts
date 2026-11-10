import type { RecipeDraft } from './draft'
import type { IngredientRef, Recipe } from '../types'

// R14 (docs/dev/design/r14-recipe-editor.md, "Ready Meal rule"): pure rules of the editor for a Ready Meal and its Ingredient.
// Stubs; the Developer implements them.

/** Normalised name for matching: trimmed, whitespace collapsed, lower case (mirrors units.NormalizeName in Go). */
export function nameKey(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase()
}

/** What the Ready Meal rule makes of a Recipe name against the known Ingredients. */
export type ReadyMealLine =
  | { kind: 'none' }
  | { kind: 'reuse'; ingredient: IngredientRef; quantity: string; unit: string }
  | { kind: 'create'; name: string; quantity: '1'; unit: 'piece' }

/**
 * blank name -> none. An Ingredient with the same nameKey -> reuse it: quantity '1' and unit 'piece' when its Base Unit is piece,
 * otherwise quantity '' and unit = its Base Unit (the User types the pack size; Feeder never invents one). No such Ingredient ->
 * create, named with the collapsed display form of the name (case kept), 1 piece.
 */
export function readyMealLine(recipeName: string, ingredients: readonly IngredientRef[]): ReadyMealLine {
  void recipeName
  void ingredients
  return { kind: 'none' }
}

/**
 * Applies the rule to a draft; call it after every change of `name`, `readyMeal` or the lines. Returns the same object when nothing changes.
 *  - readyMeal on, the draft has no real line (no lines, or only blank ones with no Ingredient and no quantity) or its only line has `auto`:
 *    that line becomes the readyMealLine of the current name: a reuse line has ingredientId, ingredientName, quantity, unit and `auto`;
 *    a create line has ingredientId null, ingredientName = the display name, quantity '1', unit 'piece' and `auto`.
 *    Blank name or kind 'none': an `auto` line is removed, nothing is added.
 *  - readyMeal on and the User's own line(s) exist (no `auto`): untouched (validateDraft reports ready_meal_lines if there are not exactly one).
 *  - readyMeal off: a pending `auto` line (ingredientId null) is removed (nothing exists to keep); a reuse `auto` line stays as an ordinary line
 *    with `auto` cleared. Unmarking never deletes an Ingredient.
 */
export function syncReadyMealLine(draft: RecipeDraft, ingredients: readonly IngredientRef[]): RecipeDraft {
  void ingredients
  return draft
}

/** The question asked after saving a renamed Ready Meal. */
export interface RenameOffer {
  ingredientId: number
  from: string
  to: string
}

/**
 * Offered when a stored Ready Meal (`before`) is saved under a new name (`draft.name`): the Recipe was and is a Ready Meal with exactly one line,
 * the line's Ingredient name has the same nameKey as the old Recipe name, the new name's key differs from the old, and no other Ingredient
 * already has the new name's key. `from` is the Ingredient's current name, `to` the trimmed new Recipe name (display form). Otherwise null.
 */
export function renameOffer(before: Recipe | undefined, draft: RecipeDraft, ingredients: readonly IngredientRef[]): RenameOffer | null {
  void before
  void draft
  void ingredients
  return null
}

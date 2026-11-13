import type { IngredientRef, RecipeKind, RecipeStep, RecipeSummary } from '../types'
import type { RecipeDraft } from './draft'

// BR-D (docs/dev/design/base-recipes.md §13): the pure rules of the editor, the list and the detail for Base recipes. Plain TypeScript, no React.
const NI = (): never => {
  throw new Error('BR-D: not implemented')
}

/** Which details fields the editor shows for a kind. */
export interface KindFields {
  courses: boolean
  wholeMeal: boolean
  readyMeal: boolean
  cooldown: boolean
  leftoverUseBy: boolean
  reheat: boolean
  frozenUseBy: boolean
  /** The Yield's unit select beside its amount. */
  yieldUnit: boolean
}

/** Plannable: everything but the Yield unit. Base recipe: only the Yield unit (Courses, Whole meal, Ready Meal, Cool-down, Use-by, Reheat time and Frozen Use-by are hidden). */
export function fieldsFor(baseRecipe: boolean): KindFields {
  void baseRecipe
  return NI()
}

/**
 * The Base recipe switch on a draft. On: baseRecipe true, yieldUnit 'portion' unless one is set, and the fields that do not apply are cleared
 * (courseIds [], wholeMeal false, wholeMealSet false, readyMeal false, cooldownDays, leftoverUseByDays, frozenUseByDays, reheatMinutes ''). Off: baseRecipe false, yieldUnit ''.
 * Returns a new draft; the input is not mutated; the same object when nothing changes.
 */
export function setBaseRecipe(draft: RecipeDraft, on: boolean): RecipeDraft {
  void draft; void on
  return NI()
}

/** "500 ml Béchamel (Base recipe)" for the detail and the editor's summary; `quantity` already formatted in the User's units. Name capitalised like other lines. */
export function baseLineLabel(quantityText: string, name: string): string {
  void quantityText; void name
  return NI()
}

export interface NeededAtOption {
  /** The Step index (0-based), null = the default (clears the override). */
  value: number | null
  label: string
}

/**
 * Options of the Needed at menu: one per non-Advance Step, in order, labelled "Step 4: Layer the lasagne" (text cut at 40 characters with an ellipsis),
 * the first Step labelled "Before you start"; the option whose index is `defaultStep` ends " (default)". A Recipe with no Steps has the one option "Before you start" with value 0.
 * Advance Steps are not listed (they happen days earlier, never "needed at").
 */
export function neededAtOptions(steps: ReadonlyArray<Pick<RecipeStep, 'text' | 'kind'>>, defaultStep: number | null): NeededAtOption[] {
  void steps; void defaultStep
  return NI()
}

/** The chip's words: "Before you start" for the first non-Advance Step (or when the Recipe has no Steps), "Needed at Step 4" for index 3. */
export function neededAtLabel(steps: ReadonlyArray<Pick<RecipeStep, 'kind'>>, step: number): string {
  void steps; void step
  return NI()
}

/**
 * Links a draft line (by key) to a Base recipe: baseRecipeId, baseRecipeName, ingredientId = the Base recipe's Ingredient (its units apply),
 * ingredientName its name, linkedFromIngredientId = the plain Ingredient the line had (kept for Use as a plain Ingredient), neededAtStep null.
 * Quantity, unit, optional and note carry over. Unknown key: the same draft.
 */
export function linkDraftLine(draft: RecipeDraft, key: string, base: { id: number; name: string; ingredientId: number }): RecipeDraft {
  void draft; void key; void base
  return NI()
}

/**
 * Back to a plain Ingredient: baseRecipeId/baseRecipeName/neededAtStep cleared, ingredientId/Name from `plain` (the linkedFrom Ingredient, or one the User picked),
 * linkedFromIngredientId cleared. Quantity, unit, optional and note carry over.
 */
export function unlinkDraftLine(draft: RecipeDraft, key: string, plain: IngredientRef): RecipeDraft {
  void draft; void key; void plain
  return NI()
}

/** The Recipes list's kind from the URL: '?kind=base' = 'base'; anything else (absent, 'plannable', junk, 'all') = 'plannable' (the control has two choices). */
export function kindFromParams(params: URLSearchParams): Exclude<RecipeKind, 'all'> {
  void params
  return NI()
}

/** Writes the kind into a copy of the params: 'base' sets `kind=base`; 'plannable' removes it (the default). Other params are kept. */
export function withKind(params: URLSearchParams, kind: Exclude<RecipeKind, 'all'>): URLSearchParams {
  void params; void kind
  return NI()
}

/** "1 l", "300 g", "8 portions" ("1 portion"): the Yield amount with its unit; a plannable Recipe (unit null/absent) gives "4 portions". */
export function yieldText(amount: number, unit: string | null | undefined): string {
  void amount; void unit
  return NI()
}

/** "Used in 3 Recipes" / "Used in 1 Recipe" / "Not used yet". */
export function usedInText(count: number): string {
  void count
  return NI()
}

/** The tile's two extra lines for a Base recipe: { yield: "Yield 1 l", usedIn: "Used in 3 Recipes" }; null for a plannable summary. */
export function baseTileMeta(recipe: Pick<RecipeSummary, 'baseRecipe' | 'yield' | 'yieldUnit' | 'usedByCount'>): { yield: string; usedIn: string } | null {
  void recipe
  return NI()
}

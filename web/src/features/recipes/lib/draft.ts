import type { Recipe, RecipeInput, StepKind } from '../types'

// The editor's form state: everything the User types is a string until draftToInput parses it.

export interface LineDraft {
  /** Stable React key; never sent. */
  key: string
  ingredientId: number | null
  ingredientName: string
  quantity: string
  unit: string
  optional: boolean
  note: string
}

export interface UseDraft {
  ingredientId: number | null
  ingredientName: string
  quantity: string
  unit: string
}

export interface StepDraft {
  key: string
  text: string
  kind: StepKind
  durationMinutes: string
  leadTimeMinutes: string
  after: number[]
  uses: UseDraft[]
  image: string
}

export interface RecipeDraft {
  name: string
  description: string
  yield: string
  readyMeal: boolean
  tags: string[]
  cooldownDays: string
  leftoverUseByDays: string
  sourceUrl: string
  sourceAttribution: string
  image: string
  lines: LineDraft[]
  steps: StepDraft[]
}

/** field path ('name', 'yield', 'lines', 'lines.0.quantity', 'steps.1.durationMinutes', ...) -> error code. */
export type DraftErrors = Record<string, string>

/** A blank Recipe: Yield "4", no lines, no Steps. */
export function emptyDraft(): RecipeDraft {
  throw new Error('TODO')
}

/** Fills a draft from a stored Recipe (numbers become strings; null overrides become ''). */
export function draftFromRecipe(_recipe: Recipe): RecipeDraft {
  throw new Error('TODO')
}

/**
 * Parses a typed number: trims, accepts a decimal comma ("1,5"), "a/b" ("1/2") and "n a/b" ("1 1/2").
 * Returns null for blank or anything else, for non-finite results and for a zero denominator.
 */
export function parseNumber(_text: string): number | null {
  throw new Error('TODO')
}

/**
 * Builds the API body. Names/notes trimmed; blank cooldown/use-by -> null (household default),
 * "0" -> 0; blank durations/lead times -> 0; unparsable numbers -> NaN-free defaults are NOT
 * applied: call validateDraft first and only convert a draft without errors. Lines without an
 * Ingredient are skipped. Advance Steps are sent with after [].
 */
export function draftToInput(_draft: RecipeDraft): RecipeInput {
  throw new Error('TODO')
}

/**
 * Quick client-side checks before saving (the server re-validates). Codes:
 *  name: name_required; yield: yield_invalid;
 *  lines: lines_required (none) | ready_meal_lines (Ready Meal without exactly one);
 *  lines.N.ingredient: ingredient_required; lines.N.quantity: quantity_invalid; lines.N.unit: unit_required;
 *  cooldownDays: cooldown_invalid; leftoverUseByDays: use_by_invalid;
 *  steps.N.text: step_text_required; steps.N.durationMinutes: passive_needs_duration;
 *  steps.N.leadTimeMinutes: advance_needs_lead_time.
 */
export function validateDraft(_draft: RecipeDraft): DraftErrors {
  throw new Error('TODO')
}

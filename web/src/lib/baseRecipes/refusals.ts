import type { ApiError } from '../http'

// BR-D (design §10, §16): the words of the refusals the Base recipe routes answer with. Pure; the screens show the message.

/** "Roux calls for Béchamel, which calls for Roux" from path [Roux, Béchamel, Roux]; a self call [A, A] reads "Béchamel calls for itself". */
export function cycleMessage(path: readonly string[]): string {
  void path
  throw new Error('BR-D: not implemented')
}

export interface InUseRefusal {
  /** "Béchamel is used in Lasagne and Moussaka" */
  message: string
  usedBy: Array<{ id: number; name: string }>
  /** The dialog offers this instead of Delete. */
  alternate: 'Archive instead'
}

/** The 409 `base_recipe_in_use` (details.usedBy) for deleting or turning back the Base recipe `name`; null for any other error. */
export function inUseRefusal(err: unknown, name: string): InUseRefusal | null {
  void err; void name
  throw new Error('BR-D: not implemented')
}

/**
 * The inline message of a Base recipe refusal, or null when the error is not one (the caller shows its generic text).
 * 422 validation_failed by details.reason: base_recipe_cycle (cycleMessage of details.path), base_recipe_name_taken, ready_meal_name_taken,
 * yield_unit_invalid, yield_invalid, base_recipe_ready_meal, base_recipe_field, needed_at_step_invalid, line_not_plain, line_not_base,
 * link_invalid, not_a_candidate, kind_invalid, base_recipe_kind, base_recipe_preference;
 * 409 base_recipe_ingredient, 409 ingredient_name_taken (details.ingredient.name); 409 base_recipe_in_use is inUseRefusal, not here.
 */
export function refusalMessage(err: unknown): string | null {
  void (err as ApiError)
  throw new Error('BR-D: not implemented')
}

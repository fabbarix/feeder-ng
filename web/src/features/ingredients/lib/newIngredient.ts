import type { IconName } from '../../../ui/icons'
import type { BaseUnit } from '../../../lib/units'
import type { Ingredient, NewIngredient, SearchResult, Suggestion } from '../types'

// R14 (docs/dev/design/r14-recipe-editor.md): pure rules of the New Ingredient sheet. Stubs; the Developer implements them.

/**
 * The Base Unit to preselect when the sheet is opened with a unit already known (the unit typed on a Recipe line, or on a Scan).
 * g, kg, oz, lb -> g; ml, l, dl, cl, tsp, tbsp, cup, fl oz -> ml; piece -> piece; blank, null or a custom unit (clove, can) -> g.
 * Trimmed, case-insensitive.
 */
export function defaultBaseUnit(unit?: string | null): BaseUnit {
  void unit
  return 'g'
}

/** The registry icon of a Base Unit option: g -> 'weigh' (Scales), ml -> 'liquid' (Drop), piece -> 'piece' (Cube). The last two are new glyphs (UF1 registry). */
export function baseUnitIcon(unit: BaseUnit): IconName {
  void unit
  return 'weigh'
}

export interface NewIngredientForm {
  name: string
  baseUnit: BaseUnit
  /** As typed: blank = none. */
  shelfLife: string
}

export type NewIngredientErrors = { name?: string; shelfLife?: string }

/**
 * Validates the sheet on submit. name: blank after trim -> strings.sheet.nameRequired. shelfLife: blank is fine (omitted from the body);
 * otherwise a whole number 1 or more, else strings.sheet.shelfLifeInvalid. On success the body has the trimmed name, the Base Unit and,
 * only when given, shelfLifeDays.
 */
export function checkNewIngredient(form: NewIngredientForm): { ok: true; value: NewIngredient } | { ok: false; errors: NewIngredientErrors } {
  void form
  return { ok: false, errors: {} }
}

/** What the sheet does after the near-duplicate lookup of the typed name (the same matcher as Import Review: GET /api/ingredients/search). */
export type DuplicateGuard =
  | { kind: 'clear' }
  | { kind: 'exists'; ingredient: Ingredient }
  | { kind: 'similar'; suggestions: Suggestion[] }

/** exact match -> 'exists'; else any suggestions -> 'similar' (as sent, best first); else 'clear'. */
export function duplicateGuard(result: SearchResult): DuplicateGuard {
  void result
  return { kind: 'clear' }
}

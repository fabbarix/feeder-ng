import type { Ingredient, NewIngredient } from '../../ingredients/types'
import type { IngredientRef } from '../types'

// R14 (docs/dev/design/r14-recipe-editor.md, "Quick create"): state of the nested New Ingredient sheet opened from an ingredient line.
// Stub; the Developer implements it. No JSX here and no draft state: the Recipe draft lives in useRecipeEditor and is never touched by opening or cancelling.

export interface QuickCreateRequest {
  lineKey: string
  /** The typed query, prefilled as the name. */
  query: string
  /** The line's current unit, the hint for the preselected Base Unit ('' = none). */
  unit: string
}

export interface UseQuickCreateIngredient {
  /** The open request, or null while the sheet is closed. */
  request: QuickCreateRequest | null
  open: (request: QuickCreateRequest) => void
  /** Closes without touching the Recipe draft or the line. */
  close: () => void
  /** POST /api/ingredients through ingredientsApi.create, then invalidates ['ingredients']; rejects with the ApiError for the sheet to show. */
  create: (body: NewIngredient) => Promise<Ingredient>
  /**
   * After the sheet created an Ingredient (or the User picked "Use Garlic" for a near duplicate): calls `pick(lineKey, ref)` with the
   * IngredientRef (id, name, baseUnit, conversions), closes, and asks for focus on that line's amount field.
   */
  select: (ingredient: Ingredient) => void
  /** The line whose amount field should take focus now, else null. Cleared by amountFocused. */
  focusLineKey: string | null
  amountFocused: () => void
  /** strings.quickCreate.offlineReason while navigator.onLine is false (app/useConnectivity), else undefined. */
  disabledReason: string | undefined
}

export function useQuickCreateIngredient(options: { pick: (lineKey: string, ingredient: IngredientRef) => void }): UseQuickCreateIngredient {
  void options
  return {
    request: null,
    open: () => {},
    close: () => {},
    create: () => Promise.reject(new Error('R14: not implemented')),
    select: () => {},
    focusLineKey: null,
    amountFocused: () => {},
    disabledReason: undefined,
  }
}

import type { Recipe } from '../types'
import type { DraftErrors, RecipeDraft } from '../lib/draft'
import type { UnitPrompt } from '../lib/unitPrompt'

export interface UseRecipeEditor {
  draft: RecipeDraft
  setDraft: (next: RecipeDraft | ((d: RecipeDraft) => RecipeDraft)) => void
  /** Field path ('name', 'lines.1.quantity', ...) -> error code, from validateDraft or a 422 validation_failed. */
  errors: DraftErrors
  saving: boolean
  isLoading: boolean
  /** Set while the server asked for a Unit Conversion (422 unknown_unit). */
  unitPrompt: UnitPrompt | null
  /**
   * Validates, then POSTs (new) or PUTs (existing). Resolves with the saved Recipe, or null when
   * client validation failed, the server rejected a field (see `errors`) or a Unit Conversion is
   * needed (see `unitPrompt`). Network/other errors reject.
   */
  save: () => Promise<Recipe | null>
  /** Saves the Unit Conversion on the Ingredient, clears the prompt and saves the Recipe again. */
  answerUnitPrompt: (toBase: number) => Promise<Recipe | null>
  dismissUnitPrompt: () => void
}

/** `recipeId` undefined = a new Recipe; otherwise the draft loads from ['recipes', id]. */
export function useRecipeEditor(_recipeId?: number): UseRecipeEditor {
  throw new Error('TODO')
}

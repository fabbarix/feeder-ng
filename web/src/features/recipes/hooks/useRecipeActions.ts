import type { UseRecipe } from './useRecipe'

export interface UseRecipeActions {
  /** Archive or unarchive (whichever the Recipe is not). */
  archive: () => Promise<void>
  /**
   * Opens the ConfirmDialog (useConfirm().choose: Cancel / "Archive instead" / "Delete", danger tone) and acts:
   * confirm -> remove() then onDeleted(); alternate -> archive; cancel -> nothing.
   */
  remove: () => Promise<void>
  /** Message of the last failure (codeMessage for an ApiError, else the generic text), or null. */
  error: string | null
}

/** The Archive and Delete actions of Recipe detail. `onDeleted` runs after a successful delete (navigate to /recipes). */
export function useRecipeActions(
  recipe: Pick<UseRecipe, 'setArchived' | 'remove'>,
  meta: { name: string; archived: boolean },
  onDeleted: () => void,
): UseRecipeActions {
  void recipe
  void meta
  void onDeleted
  throw new Error('not implemented')
}

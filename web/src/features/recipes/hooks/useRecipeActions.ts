import { useState } from 'react'
import { ApiError } from '../../../lib/http'
import { useConfirm } from '../../../ui'
import { inUseRefusal } from '../../../lib/baseRecipes/refusals'
import { codeMessage, recipeStrings } from '../strings'
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
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)

  const fail = (err: unknown) => setError(err instanceof ApiError ? codeMessage(err.code) : recipeStrings.generic)

  const archive = async () => {
    setError(null)
    try {
      await recipe.setArchived(!meta.archived)
    } catch (err) {
      fail(err)
    }
  }

  const remove = async () => {
    setError(null)
    const d = recipeStrings.deleteDialog
    const choice = await confirm.choose({
      title: d.title(meta.name),
      body: d.body,
      tone: 'danger',
      confirmLabel: d.confirm,
      alternateLabel: d.alternate,
    })
    if (choice === 'cancel') return
    if (choice === 'alternate') {
      try {
        await recipe.setArchived(true)
      } catch (err) {
        fail(err)
      }
      return
    }
    try {
      await recipe.remove()
      onDeleted()
    } catch (err) {
      // BR-D: a Base recipe that Recipes call for is not deleted; the dialog names them and offers Archive instead.
      const inUse = inUseRefusal(err, meta.name)
      if (inUse) {
        const archive = await confirm.confirm({ title: recipeStrings.inUse.title(meta.name), body: inUse.message, confirmLabel: inUse.alternate })
        if (!archive) return
        try {
          await recipe.setArchived(true)
        } catch (archiveErr) {
          fail(archiveErr)
        }
        return
      }
      fail(err)
    }
  }

  return { archive, remove, error }
}

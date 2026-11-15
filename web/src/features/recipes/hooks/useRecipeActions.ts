import { ApiError } from '../../../lib/http'
import { inUseRefusal } from '../../../lib/baseRecipes/refusals'
import { useConfirm, useToast, useUndoToast } from '../../../ui'
import { blockedDialog, deleteDialog } from '../lib/deleteDialogs'
import { recipeStrings } from '../strings'
import type { DeleteBlockedBy, RecipeRef } from '../types'
import type { UseRecipe } from './useRecipe'

export interface UseRecipeActions {
  /** Archive or unarchive (whichever the Recipe is not), at once, with an Undo toast. */
  archive: () => Promise<void>
  /**
   * SAFE-05: a Recipe that can't be deleted says why before anything is asked, and offers only Archive. Else the danger dialog
   * (Cancel / "Archive instead" / "Delete"): Delete removes it, then onDeleted() and a plain "<name> deleted" toast with no Undo.
   */
  remove: () => Promise<void>
}

export interface RecipeActionsMeta {
  name: string
  archived: boolean
  /** From the detail read; absent = unknown, treated as deletable (a late 409 still opens the right dialog). */
  deletable?: boolean
  /** Ruling 3: why it can't be deleted; absent with `deletable: false` reads as planned. */
  deleteBlockedBy?: DeleteBlockedBy
  /** The Recipes that call for a Base recipe (the "in use" dialog's rows). */
  usedBy?: readonly RecipeRef[]
}

/**
 * The Archive and Delete actions of Recipe detail (SAFE-05, RX-04 toasts). Archive and Unarchive act at once with an Undo toast; a
 * failure is an error toast with Retry. `onDeleted` runs after a successful delete (navigate to /recipes).
 */
export function useRecipeActions(recipe: Pick<UseRecipe, 'setArchived' | 'remove'>, meta: RecipeActionsMeta, onDeleted: () => void): UseRecipeActions {
  const confirm = useConfirm()
  const toast = useToast()
  const undoToast = useUndoToast()
  const t = recipeStrings.toasts
  const { name } = meta

  const failed = (title: string, retry: () => void) => toast.show({ status: 'error', title, actions: [{ label: t.retry, onClick: retry }] })

  /** Sets the archived flag; on success the Undo toast sets it back. */
  const setArchived = async (archived: boolean): Promise<void> => {
    try {
      await recipe.setArchived(archived)
    } catch {
      failed(archived ? t.archiveFailed(name) : t.unarchiveFailed(name), () => void setArchived(archived))
      return
    }
    undoToast.show({
      headline: archived ? t.archived(name) : t.unarchived(name),
      undoAriaLabel: archived ? t.undoUnarchive(name) : t.undoArchive(name),
      undo: () => recipe.setArchived(!archived),
    })
  }

  const archive = () => setArchived(!meta.archived)

  /** "<name> can't be deleted": Archive or nothing. */
  const refuse = async (reason: DeleteBlockedBy, usedBy: readonly RecipeRef[]) => {
    if (await confirm.confirm(blockedDialog(name, reason, usedBy))) await setArchived(true)
  }

  const doDelete = async (): Promise<void> => {
    try {
      await recipe.remove()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_planned') return refuse('planned', [])
      const inUse = inUseRefusal(err, name)
      if (inUse) return refuse('in_use', inUse.usedBy)
      failed(t.deleteFailed(name), () => void doDelete())
      return
    }
    onDeleted()
    toast.show({ status: 'success', title: t.deleted(name) })
  }

  const remove = async () => {
    if (meta.deletable === false) return refuse(meta.deleteBlockedBy ?? 'planned', meta.usedBy ?? [])
    const choice = await confirm.choose(deleteDialog(name))
    if (choice === 'alternate') return setArchived(true)
    if (choice === 'confirm') return doDelete()
  }

  return { archive, remove }
}

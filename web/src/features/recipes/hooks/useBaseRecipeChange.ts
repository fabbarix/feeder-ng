import type { Recipe } from '../types'

export interface UseBaseRecipeChange {
  /**
   * The Base recipe switch turned ON for a Recipe. A new (unsaved) Recipe: 'done' with no request. A saved plannable Recipe: POST to-base?dryRun=1, the ConfirmDialog
   * (convertConfirm: "Turn Pesto into a Base recipe?" naming what goes), then POST to-base { yield, yieldUnit } and `onConverted(recipe)`. Cancel/Escape: 'cancelled', nothing changed.
   */
  turnOn: (input: { name: string; yield: number; yieldUnit: string }) => Promise<'done' | 'cancelled' | 'failed'>
  /** The switch turned OFF for a saved Base recipe: POST to-plannable { yield }; `onConverted(recipe)`. 409 base_recipe_in_use: 'failed' with `error` = "Béchamel is used in Lasagne and Moussaka". A new Recipe: 'done', no request. */
  turnOff: (input: { name: string; yield: number }) => Promise<'done' | 'failed'>
  error: string | null
}

/** The kind change of the Recipe editor. `recipeId` undefined = not saved yet. Logic in lib/baseRecipes (convertConfirm, refusals, api). */
export function useBaseRecipeChange(opts: { recipeId?: number; onConverted?: (recipe: Recipe) => void }): UseBaseRecipeChange {
  void opts
  throw new Error('BR-D: not implemented')
}

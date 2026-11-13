import { useState } from 'react'
import { useConfirm } from '../../../ui/ConfirmDialog'
import { baseRecipesApi } from '../../../lib/baseRecipes/api'
import { convertConfirm } from '../../../lib/baseRecipes/convertConfirm'
import { inUseRefusal, refusalMessage } from '../../../lib/baseRecipes/refusals'
import { portionsYield } from '../../../lib/baseRecipes/yield'
import { recipeStrings } from '../strings'
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
  const { recipeId, onConverted } = opts
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)

  const turnOn: UseBaseRecipeChange['turnOn'] = async (input) => {
    setError(null)
    if (recipeId === undefined) return 'done'
    let plan
    try {
      plan = await baseRecipesApi.toBasePlan(recipeId)
    } catch (err) {
      setError(refusalMessage(err) ?? recipeStrings.generic)
      return 'failed'
    }
    const c = convertConfirm(input.name, plan)
    const yes = await confirm.confirm({ title: c.title, body: c.body, confirmLabel: c.confirmLabel })
    if (!yes) return 'cancelled'
    try {
      const recipe = await baseRecipesApi.toBase(recipeId, { yield: input.yield, yieldUnit: input.yieldUnit })
      onConverted?.(recipe)
      return 'done'
    } catch (err) {
      setError(refusalMessage(err) ?? recipeStrings.generic)
      return 'failed'
    }
  }

  const turnOff: UseBaseRecipeChange['turnOff'] = async (input) => {
    setError(null)
    if (recipeId === undefined) return 'done'
    try {
      const recipe = await baseRecipesApi.toPlannable(recipeId, { yield: portionsYield(input.yield) })
      onConverted?.(recipe)
      return 'done'
    } catch (err) {
      const inUse = inUseRefusal(err, input.name)
      setError(inUse ? inUse.message : (refusalMessage(err) ?? recipeStrings.generic))
      return 'failed'
    }
  }

  return { turnOn, turnOff, error }
}

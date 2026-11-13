import { useRef, useState } from 'react'
import { useConfirm } from '../../../ui/ConfirmDialog'
import { baseRecipesApi } from '../../../lib/baseRecipes/api'
import { convertConfirm } from '../../../lib/baseRecipes/convertConfirm'
import { inUseRefusal, refusalMessage } from '../../../lib/baseRecipes/refusals'
import { parseTakeOver } from '../../../lib/baseRecipes/takeOver'
import { portionsYield } from '../../../lib/baseRecipes/yield'
import { recipeStrings } from '../strings'
import type { Recipe } from '../types'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'

type TurnOutcome = 'done' | 'cancelled' | 'failed'

export interface UseBaseRecipeChange {
  /**
   * The Base recipe switch turned ON for a Recipe. A new (unsaved) Recipe: 'done' with no request. A saved plannable Recipe: POST to-base?dryRun=1, the ConfirmDialog
   * (convertConfirm: "Turn Pesto into a Base recipe?" naming what goes), then POST to-base { yield, yieldUnit } and `onConverted(recipe)`. Cancel/Escape: 'cancelled', nothing changed.
   * Round 4: a 409 base_recipe_take_over sets `takeOverAsk` and the promise stays open until answerTakeOver (Yes/No) or cancelTakeOver settles it.
   */
  turnOn: (input: { name: string; yield: number; yieldUnit: string }) => Promise<TurnOutcome>
  /** The take-over ask while the User has not answered it; null otherwise. */
  takeOverAsk: TakeOverAsk | null
  /** Yes/No on the ask: converts again with takeOver true/false, then settles the turn-on. */
  answerTakeOver: (yes: boolean) => Promise<void>
  /** Escape or Cancel on the ask: nothing is converted; the turn-on settles 'cancelled'. */
  cancelTakeOver: () => void
  /** The switch turned OFF for a saved Base recipe: POST to-plannable { yield }; `onConverted(recipe)`. 409 base_recipe_in_use: 'failed' with `error` = "Béchamel is used in Lasagne and Moussaka". A new Recipe: 'done', no request. */
  turnOff: (input: { name: string; yield: number }) => Promise<'done' | 'failed'>
  error: string | null
}

/** The kind change of the Recipe editor. `recipeId` undefined = not saved yet. Logic in lib/baseRecipes (convertConfirm, refusals, api). */
export function useBaseRecipeChange(opts: { recipeId?: number; onConverted?: (recipe: Recipe) => void }): UseBaseRecipeChange {
  const { recipeId, onConverted } = opts
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)
  const [takeOverAsk, setTakeOverAsk] = useState<TakeOverAsk | null>(null)
  // The turn-on waiting for the take-over answer: its input and the settle of its promise.
  const waiting = useRef<{ input: { name: string; yield: number; yieldUnit: string }; settle: (outcome: TurnOutcome) => void } | null>(null)

  /** POST to-base; 'asked' when the 409 take-over ask came back (takeOverAsk set), 'done' or 'failed' otherwise. */
  const send = async (input: { yield: number; yieldUnit: string }, takeOver?: boolean): Promise<'done' | 'asked' | 'failed'> => {
    try {
      const body = takeOver === undefined ? input : { ...input, takeOver }
      const recipe = await baseRecipesApi.toBase(recipeId as number, body)
      onConverted?.(recipe)
      return 'done'
    } catch (err) {
      const ask = takeOver === undefined ? parseTakeOver(err) : null
      if (ask) {
        setTakeOverAsk(ask)
        return 'asked'
      }
      setError(refusalMessage(err) ?? recipeStrings.generic)
      return 'failed'
    }
  }

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
    const first = await send({ yield: input.yield, yieldUnit: input.yieldUnit })
    if (first !== 'asked') return first
    return new Promise<TurnOutcome>((settle) => {
      waiting.current = { input, settle }
    })
  }

  const answerTakeOver: UseBaseRecipeChange['answerTakeOver'] = async (yes) => {
    const pending = waiting.current
    if (!pending) return
    setTakeOverAsk(null)
    const outcome = await send({ yield: pending.input.yield, yieldUnit: pending.input.yieldUnit }, yes)
    if (outcome === 'asked') return
    waiting.current = null
    pending.settle(outcome === 'done' ? 'done' : 'failed')
  }

  const cancelTakeOver = () => {
    const pending = waiting.current
    waiting.current = null
    setTakeOverAsk(null)
    pending?.settle('cancelled')
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

  return { turnOn, turnOff, error, takeOverAsk, answerTakeOver, cancelTakeOver }
}

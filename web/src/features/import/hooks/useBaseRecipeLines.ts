// BR-E (design §3.6, §11.3): the Base recipe line tiles and the convert dialog of the Import Review. React state here; the rules are in lib/.
import { useCallback, useMemo, useState } from 'react'
import { baseRecipesApi } from '../../../lib/baseRecipes/api'
import { convertConfirm, type ConvertConfirm } from '../../../lib/baseRecipes/convertConfirm'
import { refusalMessage } from '../../../lib/baseRecipes/refusals'
import { baseRecipeRows, takeOverFor, type BaseRecipeRow } from '../lib/baseRecipeLines'
import { yieldFromLine } from '../../../lib/baseRecipes/yield'
import { importStrings } from '../strings'
import type { BaseRecipeAnswer, ImportTakeOverAsk, Plan } from '../types'

/** The convert dialog of one tile: a plannable Recipe, its dry run, and the Yield the User is giving it. */
export interface ConvertState {
  path: string
  recipe: { id: number; name: string }
  status: 'loading' | 'ready' | 'error'
  /** What the conversion takes away (ready only). */
  confirm?: ConvertConfirm
  yield: number | null
  yieldUnit: string
  /** Why the dry run failed (error only). */
  error?: string
}

export interface UseBaseRecipeLines {
  rows: BaseRecipeRow[]
  /** The take-over ask of the tile at `path`, if any. */
  askFor: (path: string) => ImportTakeOverAsk | undefined
  /** Answers a tile (sent through the review). */
  answer: (path: string, answer: BaseRecipeAnswer) => void
  /** The convert dialog, or null when closed. */
  convert: ConvertState | null
  /** Opens the convert dialog for a plannable Recipe: asks the dry run, and prefills the Yield from the line. */
  startConvert: (path: string, recipe: { id: number; name: string }) => Promise<void>
  setYield: (value: number | null) => void
  setYieldUnit: (unit: string) => void
  canConfirmConvert: boolean
  /** Turn into a Base recipe: answers the tile with the Yield and closes the dialog. */
  confirmConvert: () => void
  cancelConvert: () => void
}

/** `plan` is undefined while no review is open; then there are no rows. */
export function useBaseRecipeLines({ plan, onAnswer }: { plan?: Plan; onAnswer: (path: string, answer: BaseRecipeAnswer) => void }): UseBaseRecipeLines {
  const [convert, setConvert] = useState<ConvertState | null>(null)
  const rows = useMemo(() => (plan ? baseRecipeRows(plan) : []), [plan])

  const askFor = useCallback((path: string) => (plan ? takeOverFor(plan, path) : undefined), [plan])
  const answer = useCallback((path: string, next: BaseRecipeAnswer) => onAnswer(path, next), [onAnswer])

  const startConvert = useCallback(
    async (path: string, recipe: { id: number; name: string }) => {
      const line = plan?.baseRecipeLines.find((l) => l.path === path)
      const prefilled = line ? yieldFromLine(line.quantity, line.unit) : { yield: 1, yieldUnit: 'portion' }
      setConvert({ path, recipe, status: 'loading', yield: prefilled.yield, yieldUnit: prefilled.yieldUnit })
      try {
        const dryRun = await baseRecipesApi.toBasePlan(recipe.id)
        setConvert((c) => (c && c.path === path && c.recipe.id === recipe.id ? { ...c, status: 'ready', confirm: convertConfirm(recipe.name, dryRun) } : c))
      } catch (e) {
        const message = refusalMessage(e) ?? importStrings.baseRecipes.convertFailed
        setConvert((c) => (c && c.path === path && c.recipe.id === recipe.id ? { ...c, status: 'error', error: message } : c))
      }
    },
    [plan],
  )

  const setYield = useCallback((value: number | null) => setConvert((c) => (c ? { ...c, yield: value } : c)), [])
  const setYieldUnit = useCallback((unit: string) => setConvert((c) => (c ? { ...c, yieldUnit: unit } : c)), [])

  const canConfirmConvert = convert !== null && convert.status === 'ready' && convert.yield !== null && convert.yield > 0

  const confirmConvert = useCallback(() => {
    if (!convert || !canConfirmConvert) return
    onAnswer(convert.path, { action: 'convert', recipeId: convert.recipe.id, yield: convert.yield!, yieldUnit: convert.yieldUnit })
    setConvert(null)
  }, [convert, canConfirmConvert, onAnswer])

  const cancelConvert = useCallback(() => setConvert(null), [])

  return { rows, askFor, answer, convert, startConvert, setYield, setYieldUnit, canConfirmConvert, confirmConvert, cancelConvert }
}

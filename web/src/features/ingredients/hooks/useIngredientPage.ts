// B9-48 (SET-05, SAFE-02): what the Ingredient page does besides showing: the sheets and the Delete confirm that are open, the
// page's one form-level failure, Delete after the impact read, and a removed Unit Conversion with Undo.
import { useState } from 'react'
import { useUndoToast } from '../../../ui'
import { errorMessage } from '../lib/errorMessage'
import { deleteConfirm, isInUse } from '../lib/impact'
import { strings } from '../strings'
import type { ConfirmOptions } from '../../../ui'
import type { Conversion, IngredientKind } from '../types'
import type { UseIngredient } from './useIngredient'
import { useIngredientImpact } from './useIngredientImpact'

export type PageSheet = 'rename' | 'merge' | 'delete' | null

export interface UseIngredientPage {
  sheet: PageSheet
  open: (sheet: Exclude<PageSheet, null>) => void
  close: () => void
  /** A failure that belongs to no field (a refused delete or picture): the page's one FormError. */
  failure: string | null
  /** Runs a change; a refusal becomes `failure`. Resolves to true when it went through. */
  attempt: (run: () => Promise<unknown>) => Promise<boolean>
  /** The Delete confirm's options, from the impact read made while it is open. */
  deleteOptions: ConfirmOptions
  /** The confirm's button: deletes (then `onDeleted`), or, when the read found it still used, opens Merge instead. */
  confirmDelete: () => Promise<void>
  /** SAFE-02: removes at once and offers Undo ("1 clove removed"). */
  removeConversion: (unit: string) => Promise<void>
}

export function useIngredientPage(ing: UseIngredient, kind: IngredientKind, id: number, onDeleted: () => void): UseIngredientPage {
  const [sheet, setSheet] = useState<PageSheet>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const undo = useUndoToast()
  const { impact } = useIngredientImpact(id, sheet === 'delete')
  const name = ing.ingredient?.name ?? ''

  const attempt = async (run: () => Promise<unknown>) => {
    setFailure(null)
    try {
      await run()
      return true
    } catch (e) {
      setFailure(errorMessage(e))
      return false
    }
  }

  return {
    sheet,
    open: (next) => {
      setFailure(null)
      setSheet(next)
    },
    close: () => setSheet(null),
    failure,
    attempt,
    deleteOptions: deleteConfirm(kind, name, impact),
    confirmDelete: async () => {
      if (isInUse(impact)) {
        setSheet('merge')
        return
      }
      setSheet(null)
      if (await attempt(() => ing.remove())) onDeleted()
    },
    removeConversion: async (unit) => {
      const removed: Conversion | undefined = ing.ingredient?.conversions.find((c) => c.unit === unit)
      if (!(await attempt(() => ing.removeConversion(unit))) || !removed) return
      undo.show({
        headline: strings.conversionRemoved.headline(unit),
        undoAriaLabel: strings.conversionRemoved.undoAria(unit),
        restored: strings.conversionRemoved.restored(unit),
        undo: () => ing.setConversion(removed),
      })
    },
  }
}

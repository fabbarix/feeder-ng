// B9-43 (SSP-14, decision SSP 6 / D6-A): "Get something else…": add an extra and take the Line off the list in one step, with one Undo.
import { useCallback, useMemo, useState } from 'react'
import { useUndoToast } from '../../../ui/useUndoToast'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'
import type { ExtraInput } from '../types'
import { useShoppingActions } from './useShoppingActions'

export interface Substitute {
  /** the Line being swapped; null while idle (the Add to Shopping List sheet is open exactly while this is set) */
  target: ListEntry | null
  start(entry: ListEntry): void
  cancel(): void
  /**
   * Save in the Add to Shopping List sheet: adds the extra, then takes the Line off the list for the range (Not needed), then ONE toast
   * "Onion is Not needed; Shallot added" whose Undo puts the Line back and deletes the extra. `addedName` is the new thing's name.
   * A failed add rejects and touches nothing; a failed Not needed deletes the extra again and rejects (all or nothing).
   */
  submit(input: ExtraInput, addedName: string): Promise<void>
}

export interface UseSubstituteOptions {
  to: string | undefined
  shopId: number | null
}

export function useSubstitute({ to, shopId }: UseSubstituteOptions): Substitute {
  const actions = useShoppingActions()
  const undoToast = useUndoToast()
  const [target, setTarget] = useState<ListEntry | null>(null)

  const start = useCallback((entry: ListEntry) => setTarget(entry), [])
  const cancel = useCallback(() => setTarget(null), [])

  const submit = useCallback(
    async (input: ExtraInput, addedName: string) => {
      const line = target
      if (!line || line.ingredientId === null || !to) return
      const ingredientId = line.ingredientId
      const extra = await actions.addExtra(input)
      try {
        await actions.notNeeded({ ingredientId, to, shopId })
      } catch (error) {
        await actions.deleteExtra(extra.id).catch(() => undefined)
        throw error
      }
      setTarget(null)
      undoToast.show({
        headline: shopStrings.substituted(line.title, addedName),
        undo: async () => {
          await actions.neededAfterAll(ingredientId, to, shopId)
          await actions.deleteExtra(extra.id)
        },
      })
    },
    [actions, target, to, shopId, undoToast],
  )

  return useMemo(() => ({ target, start, cancel, submit }), [target, start, cancel, submit])
}

// Beta.8 (scan): tick a Line by hand from the To get tab. The Shop screen's tick (useShoppingActions, with the Line's remaining
// quantity and a fresh client id), a toast with Undo, and a failure (offline included) that changes nothing and can be tried
// again. A row in flight is pending and ignores further taps.
import { useCallback, useRef, useState } from 'react'
import { useShoppingActions } from '../../shop/hooks/useShoppingActions'
import type { ListEntry } from '../../shop/lib/lines'
import { useToast } from '../../../ui/Toast'
import { tickRequest } from '../lib/toGet'
import { scanStrings } from '../strings'

export interface ToGetTick {
  tick(entry: ListEntry): Promise<void>
  /** the keys ("line:<ingredientId>") of the rows whose tick is in flight */
  pendingKeys: ReadonlySet<string>
}

export function useToGetTick({ to, shopId }: { to: string | undefined; shopId: number | null }): ToGetTick {
  const actions = useShoppingActions()
  const toast = useToast()
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set())
  // A ref answers the "already in flight" question at once, so a second tap before a re-render is still ignored.
  const inFlight = useRef(new Set<string>())

  const setPending = () => setPendingKeys(new Set(inFlight.current))

  const tick = useCallback(
    async (entry: ListEntry) => {
      const request = tickRequest(entry)
      if (to === undefined || request === null || inFlight.current.has(entry.key)) return
      const { ingredientId } = request
      inFlight.current.add(entry.key)
      setPending()
      try {
        await actions.tick({ ingredientId, to, quantity: request.quantity, shopId })
        toast.show(scanStrings.lineTicked(entry.title), {
          actionLabel: scanStrings.undoAction,
          onAction: () => {
            actions.untick(ingredientId, to).catch(() => toast.show(scanStrings.untickFailed, { status: 'error' }))
          },
        })
      } catch {
        toast.show(scanStrings.tickFailed(entry.title), { status: 'error' })
      } finally {
        inFlight.current.delete(entry.key)
        setPending()
      }
    },
    [actions, toast, to, shopId],
  )

  return { tick, pendingKeys }
}

// Beta.8 (scan): tick a Line by hand from the To get tab. B9-34 (SSP-01): it is the Shop's tick (shop/hooks/useTickFlow): the same
// default amount, the same Undo toast with Change (5 s here, the Shop's is 8 s), the same Change sheet (the screen mounts it from `flow`).
// A failure (offline included) changes nothing, shows Scan's own error toast and can be tried again. A row in flight is pending.
import { useCallback, useMemo } from 'react'
import { actionFailed, failureToast } from '../../../lib/errorCopy'
import { shopStrings } from '../../shop/strings'
import type { UnitSystem } from '../../../lib/units'
import { useTickFlow, type TickFlow } from '../../shop/hooks/useTickFlow'
import type { ListEntry } from '../../shop/lib/lines'
import { useToast } from '../../../ui/Toast'
import { tickRequest } from '../lib/toGet'
import { scanStrings } from '../strings'

/** Scan's Undo toast lasts 5 s (the Shop's lasts the Undo default, 8 s). */
export const SCAN_UNDO_MS = 5000

export interface ToGetTick {
  tick(entry: ListEntry): Promise<void>
  /** the keys ("line:<ingredientId>", "more:<ingredientId>") of the rows whose tick is in flight */
  pendingKeys: ReadonlySet<string>
  /** B9-34: the shared tick flow (optional only so the ScanController test doubles of other packages still compile; the real hook always returns it) (its `changing` / `change` / `closeChange` drive the Change sheet the screen mounts) */
  flow?: Pick<TickFlow, 'changing' | 'change' | 'closeChange'>
}

export function useToGetTick({ to, shopId, system = 'metric' }: { to: string | undefined; shopId: number | null; system?: UnitSystem }): ToGetTick {
  const flow = useTickFlow({ to, shopId, system, durationMs: SCAN_UNDO_MS })
  const toast = useToast()
  const flowTick = flow.tick

  const tick = useCallback(
    async (entry: ListEntry) => {
      if (to === undefined || tickRequest(entry) === null) return
      try {
        await flowTick(entry)
      } catch {
        toast.show(scanStrings.tickFailed(entry.title), { status: 'error' })
      }
    },
    [flowTick, toast, to],
  )

  // A failed Save or "Tick without adding" in the Change sheet: the failure toast; the sheet stays open on its subject for a retry.
  const { changing, change: flowChange, closeChange } = flow
  const sheetFlow = useMemo(
    () => ({
      changing,
      closeChange,
      change: async (quantity: number) => {
        try {
          await flowChange(quantity)
        } catch (err) {
          toast.show(failureToast(actionFailed(shopStrings.failed.change(changing?.entry.title ?? ''), err, { serverMessage: true })))
        }
      },
    }),
    [changing, closeChange, flowChange, toast],
  )

  return { tick, pendingKeys: flow.pendingKeys, flow: sheetFlow }
}

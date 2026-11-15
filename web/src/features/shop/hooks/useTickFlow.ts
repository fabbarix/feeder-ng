// B9-34 (SSP-01, SSP 2, SSP-18, RES-03): the one-tap tick, its toast, Undo, Change, Take back and Untick. React-facing state only: what
// to send is lib/tickAmount planTick (pure), the calls are useShoppingActions, the toast is the shared useUndoToast.
// B9-54: the offline queue replaces the one call `send(plan)` makes; the client id is made here and kept.
import { useCallback, useMemo, useRef, useState } from 'react'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { useUndoToast } from '../../../ui/useUndoToast'
import { newClientUuid } from '../../scan/lib/queue'
import { planTick, type ChangeTarget, type TickPlan } from '../lib/tickAmount'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'
import type { TickAddition, TickResult } from '../types'
import { useShoppingActions } from './useShoppingActions'

export interface UseTickFlowOptions {
  /** the range's last date, as the list answered it; undefined until the list has loaded */
  to: string | undefined
  shopId: number | null
  system: UnitSystem
  /** the Undo toast's duration; omitted = the Undo default (8 s). Scan passes 5000. */
  durationMs?: number
}

export interface TickFlow {
  tick(entry: ListEntry): Promise<void>
  /** the keys of the entries whose tick or untick is in flight */
  pendingKeys: ReadonlySet<string>
  /** the Change sheet's subject, or null */
  changing: ChangeTarget | null
  openChange(target: ChangeTarget): void
  closeChange(): void
  /** Save in the Change sheet (quantity > 0) or "Tick without adding" (0): PATCH the addition. Closes the sheet. */
  change(quantity: number): Promise<void>
  /** Take back one addition of a ticked entry, with the Take back toast. */
  takeBack(entry: ListEntry, addition: TickAddition): Promise<void>
  /** Untick every hand addition (the sheet's "Untick {Line}"). No toast (main-session ruling): the sheet's note says what it does. */
  untick(entry: ListEntry): Promise<void>
}

export function useTickFlow({ to, shopId, system, durationMs }: UseTickFlowOptions): TickFlow {
  const actions = useShoppingActions()
  const undoToast = useUndoToast()
  const inFlight = useRef(new Set<string>())
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [changing, setChanging] = useState<ChangeTarget | null>(null)

  const busy = useCallback(async <T,>(key: string, run: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current.has(key)) return undefined
    inFlight.current.add(key)
    setPendingKeys(new Set(inFlight.current))
    try {
      return await run()
    } finally {
      inFlight.current.delete(key)
      setPendingKeys(new Set(inFlight.current))
    }
  }, [])

  /** The one call that sends a tick plan (B9-54 queues the same plan instead). */
  const send = useCallback(
    (plan: TickPlan): Promise<TickResult> =>
      plan.kind === 'line' ? actions.tick(plan.request) : actions.tickExtra(plan.request.extraId, plan.request.quantity, plan.request.shopId, plan.request.clientUuid),
    [actions],
  )

  /** PATCH one addition of an entry to `quantity` (0 = Take back; the tick stays). */
  const setAddition = useCallback(
    async (entry: ListEntry, quantity: number, clientUuid: string | null, end: string) => {
      if (entry.kind === 'extra') {
        if (entry.extraId === null) return
        await actions.changeExtraTick(entry.extraId, quantity)
        return
      }
      if (entry.ingredientId === null) return
      await actions.changeTick({ ingredientId: entry.ingredientId, to: end, quantity, shopId, clientUuid })
    },
    [actions, shopId],
  )

  const amount = useCallback((n: number, entry: ListEntry) => formatQuantity(n, entry.baseUnit ?? 'piece', system), [system])

  const tick = useCallback(
    async (entry: ListEntry) => {
      if (!to) return
      const end = to
      const clientUuid = newClientUuid()
      const plan = planTick(entry, { to: end, shopId, clientUuid })
      if (!plan) return
      const result = await busy(entry.key, () => send(plan))
      if (!result) return
      const tickedAt = new Date().toISOString()
      const added = result.added ?? 0
      const undo = async () => {
        if (entry.moreSince) return setAddition(entry, 0, clientUuid, end)
        if (plan.kind === 'line') return actions.untick(plan.request.ingredientId, end)
        return actions.untickExtra(plan.request.extraId)
      }
      undoToast.show({
        headline: shopStrings.tickedToast(entry.title),
        ...(added > 0 && entry.baseUnit ? { subline: shopStrings.addedToStock(amount(added, entry)) } : {}),
        actions: added > 0 ? [{ label: shopStrings.change, onClick: () => setChanging({ entry, added, tickedAt, clientUuid }) }] : [],
        undo,
        ...(durationMs !== undefined ? { durationMs } : {}),
      })
    },
    [to, shopId, busy, send, setAddition, actions, undoToast, amount, durationMs],
  )

  const change = useCallback(
    async (quantity: number) => {
      if (!changing || !to) return
      await setAddition(changing.entry, quantity, changing.clientUuid, to)
      setChanging(null)
    },
    [changing, to, setAddition],
  )

  const takeBack = useCallback(
    async (entry: ListEntry, addition: TickAddition) => {
      if (!to) return
      const end = to
      const old = addition.quantity ?? 0
      await setAddition(entry, 0, addition.clientUuid, end)
      const q = amount(old, entry)
      undoToast.show({
        headline: addition.mine ? shopStrings.takenBackMine(q, entry.title) : shopStrings.takenBackOf(addition.who, q, entry.title),
        undo: () => setAddition(entry, old, addition.clientUuid, end),
        ...(durationMs !== undefined ? { durationMs } : {}),
      })
    },
    [to, setAddition, amount, undoToast, durationMs],
  )

  const untick = useCallback(
    async (entry: ListEntry) => {
      if (!to) return
      const end = to
      await busy(entry.key, async () => {
        if (entry.kind === 'extra') {
          if (entry.extraId !== null) await actions.untickExtra(entry.extraId)
        } else if (entry.ingredientId !== null) {
          await actions.untick(entry.ingredientId, end)
        }
      })
    },
    [to, busy, actions],
  )

  const openChange = useCallback((target: ChangeTarget) => setChanging(target), [])
  const closeChange = useCallback(() => setChanging(null), [])

  return useMemo(
    () => ({ tick, pendingKeys, changing, openChange, closeChange, change, takeBack, untick }),
    [tick, pendingKeys, changing, openChange, closeChange, change, takeBack, untick],
  )
}

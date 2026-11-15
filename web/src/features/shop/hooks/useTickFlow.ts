// B9-34 (SSP-01, SSP 2, SSP-18, RES-03): the one-tap tick, its toast, Undo, Change, Take back and Untick. React-facing state only: what
// to send is lib/tickAmount planTick (pure), the calls are useShoppingActions, the toast is the shared useUndoToast.
// B9-54 (RES-03, decision RES 1): offline, or when a send cannot reach the server (status 0 or 5xx), the SAME plan goes into the app's one
// offline queue (scan/components/SyncQueueProvider) under the SAME client id: the row shows it ticked at once (waiting to sync), one Undo toast
// with the pending status says so, Undo cancels it from the queue, Change rewrites the queued amount. Take back stays a direct call.
import { useCallback, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { useUndoToast } from '../../../ui/useUndoToast'
import { useSharedSyncQueue, type SharedSyncQueue } from '../../scan/components/SyncQueueProvider'
import { newClientUuid } from '../../scan/lib/queue'
import type { Op } from '../../scan/types'
import { tickOp, untickAdditionOp, untickLineOp } from '../lib/pendingTicks'
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
  /** A11Y-07: a tick was undone (its row comes back): the screen puts the focus back on that row's tick. */
  onUndone?: (entry: ListEntry) => void
  /** B9-54: the offline queue to use (the Scan screen passes the one it holds); default the shell's shared queue */
  queue?: SharedSyncQueue
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

/** The server could not be reached (no network, a timeout, or a 5xx): the request may be tried again later from the queue. */
const unreachable = (err: unknown): boolean => err instanceof ApiError && (err.status === 0 || err.status >= 500)

export function useTickFlow({ to, shopId, system, durationMs, onUndone, queue: given }: UseTickFlowOptions): TickFlow {
  const actions = useShoppingActions()
  const undoToast = useUndoToast()
  const queue = useSharedSyncQueue(given)
  const { online, enqueue, cancel, updateQueuedTick } = queue
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

  /** Undo of a tick: off the server (the More row's tick as if never made, so the More comes back; a PATCH to 0 would keep it covered). */
  const undoOnServer = useCallback(
    async (entry: ListEntry, plan: TickPlan, end: string) => {
      if (entry.moreSince) await actions.untickAddition(plan.request.clientUuid)
      else if (plan.kind === 'line') await actions.untick(plan.request.ingredientId, end)
      else await actions.untickExtra(plan.request.extraId)
    },
    [actions],
  )

  /** Queues the plan (B9-54): one Undo toast with the pending status; Undo cancels it from the queue while it waits. */
  const queueTick = useCallback(
    async (entry: ListEntry, plan: TickPlan, end: string) => {
      const scannedAt = new Date().toISOString()
      const op = tickOp(plan, { covers: entry.quantity, scannedAt, ...(entry.moreSince ? { more: true } : {}) })
      await enqueue(op)
      const quantity = plan.request.quantity
      const { clientUuid } = plan.request
      undoToast.show({
        headline: shopStrings.tickedToast(entry.title),
        status: 'pending',
        subline: quantity > 0 && entry.baseUnit ? shopStrings.waitingGoesToStock(amount(quantity, entry)) : shopStrings.waitingToSync,
        actions:
          quantity > 0 ? [{ label: shopStrings.change, onClick: () => setChanging({ entry, added: quantity, tickedAt: scannedAt, clientUuid, waiting: true }) }] : [],
        undo: async () => {
          // nothing reached the server: no Stock Lot is ever made. Sent (or tried) already: the server unticks it, as online.
          if (!(await cancel(clientUuid))) await undoOnServer(entry, plan, end)
          onUndone?.(entry)
        },
        ...(durationMs !== undefined ? { durationMs } : {}),
      })
    },
    [enqueue, cancel, undoOnServer, undoToast, amount, durationMs, onUndone],
  )

  const tick = useCallback(
    async (entry: ListEntry) => {
      if (!to) return
      const end = to
      const clientUuid = newClientUuid()
      const plan = planTick(entry, { to: end, shopId, clientUuid })
      if (!plan) return
      const outcome = await busy(entry.key, async (): Promise<TickResult | 'queued'> => {
        if (!online) {
          await queueTick(entry, plan, end)
          return 'queued'
        }
        try {
          return await send(plan)
        } catch (err) {
          if (!unreachable(err)) throw err
          await queueTick(entry, plan, end)
          return 'queued'
        }
      })
      if (!outcome || outcome === 'queued') return
      const result = outcome
      const tickedAt = new Date().toISOString()
      const added = result.added ?? 0
      undoToast.show({
        headline: shopStrings.tickedToast(entry.title),
        ...(added > 0 && entry.baseUnit ? { subline: shopStrings.addedToStock(amount(added, entry)) } : {}),
        actions: added > 0 ? [{ label: shopStrings.change, onClick: () => setChanging({ entry, added, tickedAt, clientUuid }) }] : [],
        undo: async () => {
          await undoOnServer(entry, plan, end)
          onUndone?.(entry)
        },
        ...(durationMs !== undefined ? { durationMs } : {}),
      })
    },
    [to, shopId, busy, send, online, queueTick, undoOnServer, undoToast, amount, durationMs, onUndone],
  )

  const change = useCallback(
    async (quantity: number) => {
      if (!changing || !to) return
      // B9-54: a Tick still in the queue takes the new amount in place; once it left the queue, the synced Tick is PATCHed
      const queued = changing.clientUuid !== null && (await updateQueuedTick(changing.clientUuid, quantity))
      if (!queued) await setAddition(changing.entry, quantity, changing.clientUuid, to)
      setChanging(null)
    },
    [changing, to, setAddition, updateQueuedTick],
  )

  const takeBack = useCallback(
    async (entry: ListEntry, addition: TickAddition) => {
      if (!to) return
      const end = to
      // B9-54: an addition still in the queue is taken back by cancelling it: nothing reached the server, nothing to say
      if (addition.syncedAt === null && addition.clientUuid !== null && (await cancel(addition.clientUuid))) return
      const old = addition.quantity ?? 0
      // not queued (RES-03 ruling): offline this fails and the screen's warning toast names it
      await setAddition(entry, 0, addition.clientUuid, end)
      const q = amount(old, entry)
      undoToast.show({
        headline: addition.mine ? shopStrings.takenBackMine(q, entry.title) : shopStrings.takenBackOf(addition.who, q, entry.title),
        undo: () => setAddition(entry, old, addition.clientUuid, end),
        ...(durationMs !== undefined ? { durationMs } : {}),
      })
    },
    [to, cancel, setAddition, amount, undoToast, durationMs],
  )

  const untick = useCallback(
    async (entry: ListEntry) => {
      if (!to) return
      const end = to
      await busy(entry.key, async () => {
        // B9-54: this phone's Ticks still in the queue are cancelled; what is left is on the server
        const additions = entry.tick?.additions ?? []
        let left = additions.filter((a) => !(a.syncedAt === null && a.mine))
        for (const a of additions) {
          if (a.syncedAt !== null || !a.mine || a.clientUuid === null) continue
          if (!(await cancel(a.clientUuid))) left = [...left, a] // it was sent meanwhile: it is the server's to take off
        }
        if (additions.length > 0 && left.length === 0) return
        const direct = async () => {
          if (entry.kind === 'extra') {
            if (entry.extraId !== null) await actions.untickExtra(entry.extraId)
          } else if (entry.ingredientId !== null) {
            await actions.untick(entry.ingredientId, end)
          }
        }
        if (online) {
          try {
            return await direct()
          } catch (err) {
            if (!unreachable(err)) throw err
          }
        }
        for (const op of untickOps(entry, left, end)) await enqueue(op)
      })
    },
    [to, busy, actions, online, cancel, enqueue],
  )

  const openChange = useCallback((target: ChangeTarget) => setChanging(target), [])
  const closeChange = useCallback(() => setChanging(null), [])

  return useMemo(
    () => ({ tick, pendingKeys, changing, openChange, closeChange, change, takeBack, untick }),
    [tick, pendingKeys, changing, openChange, closeChange, change, takeBack, untick],
  )
}

/**
 * B9-54: the shop_untick Ops that untick an entry offline: one for a Line (the server takes back every hand addition for the range), one per
 * synced hand addition of an Ingredient extra (by its client id). An extra's addition from before the offline queue has no client id and
 * cannot be named offline: that untick fails (the screen says so) rather than being lost silently.
 */
function untickOps(entry: ListEntry, synced: readonly { by: string; clientUuid: string | null }[], end: string): Op[] {
  const scannedAt = new Date().toISOString()
  if (entry.kind === 'line') {
    if (entry.ingredientId === null) return []
    return [untickLineOp({ clientUuid: newClientUuid(), scannedAt, ingredientId: entry.ingredientId, rangeTo: end })]
  }
  const hand = synced.filter((a) => a.by === 'hand')
  if (hand.some((a) => a.clientUuid === null)) throw new ApiError(0, 'network', 'offline')
  return hand.map((a) => untickAdditionOp({ clientUuid: newClientUuid(), scannedAt, tickClientUuid: a.clientUuid! }))
}

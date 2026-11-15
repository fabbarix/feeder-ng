// B9-54 (RES-03, decisions RES 1 and RES 2): the Shop's side of the app's one offline queue. React-facing state only: the list with the waiting
// Ticks applied (lib/pendingTicks), how many wait, the notices a sync leaves (lib/tickNotices), the rows whose Tick was refused, and the notices'
// actions (Take mine back, Add to Stock, Dismiss). The queue itself is scan/components/SyncQueueProvider's, mounted once under the shell.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { useSharedSyncQueue, type SharedSyncQueue } from '../../scan/components/SyncQueueProvider'
import type { Op, ScanResult } from '../../scan/types'
import { useStockActions } from '../../stock/hooks/useStock'
import { applyPending, countPending, failedKeys } from '../lib/pendingTicks'
import { tickNotices, type TickNotice, type TickNoticeAction } from '../lib/tickNotices'
import { displayName } from '../../ingredients/lib/names'
import type { BaseUnit, ShoppingList } from '../types'
import { useShoppingActions } from './useShoppingActions'

export interface UseTickSyncOptions {
  /** the server's list; undefined while it loads */
  list: ShoppingList | undefined
  system: UnitSystem
  /** the viewer's display name, for a waiting addition */
  who: string
  /** the Household's IANA zone; null while unknown (the notices then show no times) */
  timeZone: string | null
  shopId: number | null
  /** the offline queue the screen holds (shared with its tick flow); default the shared one */
  queue?: SharedSyncQueue
}

export interface TickSync {
  /** the list as the phone shows it: the waiting Ticks applied */
  list: ShoppingList | undefined
  /** Ticks still waiting in the queue (the metric strip's "· 1 waiting") */
  waiting: number
  /** the keys of the rows whose Tick was refused on sync, until its notice is dismissed */
  failed: ReadonlySet<string>
  /** the sync notices, oldest first */
  notices: readonly TickNotice[]
  /** runs a notice's button; rejects when the call fails (the notice stays) */
  act(notice: TickNotice, action: TickNoticeAction): Promise<void>
  /** the name of the Line or extra an Op is about ("Garlic"), as the list shows it; '' when it is not on the list */
  nameOf(op: Op): string
}

/** The name of the Line or extra an Op is about, as the phone's list shows it, and its unit. */
function subjectOf(list: ShoppingList | undefined, op: Op): { name: string; unit: BaseUnit; ingredientId: number | null } {
  if (op.extraId !== undefined) {
    const extra = list?.extras.find((e) => e.id === op.extraId)
    return { name: extra?.text ?? (extra?.name ? displayName(extra.name) : ''), unit: extra?.baseUnit ?? 'piece', ingredientId: extra?.ingredientId ?? null }
  }
  const line = list?.lines.find((l) => l.ingredientId === op.ingredientId) ?? list?.notNeeded?.find((l) => l.ingredientId === op.ingredientId)
  return { name: line ? displayName(line.name) : '', unit: line?.baseUnit ?? 'piece', ingredientId: op.ingredientId ?? null }
}

export function useTickSync({ list, system, who, timeZone, shopId, queue: given }: UseTickSyncOptions): TickSync {
  const queue = useSharedSyncQueue(given)
  const actions = useShoppingActions()
  const stock = useStockActions()
  const [notices, setNotices] = useState<readonly TickNotice[]>([])
  const listRef = useRef(list)
  listRef.current = list
  const contextRef = useRef({ system, timeZone })
  contextRef.current = { system, timeZone }

  const { subscribe } = queue
  useEffect(
    () =>
      subscribe((results: ScanResult[], _scanNotices, sent: Op[]) => {
        const { system: sys, timeZone: zone } = contextRef.current
        const found = tickNotices({
          results,
          sent,
          titleOf: (op) => subjectOf(listRef.current, op).name,
          format: (op, q) => formatQuantity(q, subjectOf(listRef.current, op).unit, sys),
          timeZone: zone,
          now: new Date(),
        })
        if (found.length === 0) return
        // a retry's `duplicate` answer is the same notice: it is told once
        setNotices((prev) => [...prev.filter((n) => !found.some((f) => f.id === n.id)), ...found])
      }),
    [subscribe],
  )

  const shown = useMemo(() => (list ? applyPending(list, queue.pendingOps, { who }) : undefined), [list, queue.pendingOps, who])
  const waiting = useMemo(() => countPending(queue.pendingOps).ticks, [queue.pendingOps])
  const failed = useMemo(() => failedKeys(notices.filter((n) => n.kind === 'refused').map((n) => n.op)), [notices])

  const dismiss = useCallback((id: string) => setNotices((prev) => prev.filter((n) => n.id !== id)), [])

  const act = useCallback(
    async (notice: TickNotice, action: TickNoticeAction) => {
      const { op } = notice
      if (action === 'takeMineBack') {
        // this Tick's own addition only (ADR 0019 per addition): the other one, and the Tick, stay
        if (op.extraId !== undefined) await actions.changeExtraTick(op.extraId, 0)
        else if (op.ingredientId !== undefined && op.rangeTo !== undefined) {
          await actions.changeTick({ ingredientId: op.ingredientId, to: op.rangeTo, quantity: 0, shopId: op.shopId ?? shopId, clientUuid: op.clientUuid })
        }
      } else if (action === 'addToStock') {
        // the User did buy it: the Stock Lot is added directly, with the amount the Tick carried
        const ingredientId = subjectOf(listRef.current, op).ingredientId
        if (ingredientId !== null && (op.quantity ?? 0) > 0) await stock.addLot({ ingredientId, quantity: op.quantity ?? 0 })
      }
      dismiss(notice.id)
    },
    [actions, stock, shopId, dismiss],
  )

  const nameOf = useCallback((op: Op) => subjectOf(listRef.current, op).name, [])

  return { list: shown, waiting, failed, notices, act, nameOf }
}

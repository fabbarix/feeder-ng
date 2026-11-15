// The seams where Today reads other features: Planning (T11) and Stock (T10). Tests mock this module. Only this file (and the
// small shopSeam and shoppingSeam beside it) imports other features' hooks, so Today's own components and hooks stay decoupled.
// B9-44 (TB-12): the Scan session is read from the persisted session in shoppingSeam.ts; the Shopping List screen seam is gone.
import { useQueryClient } from '@tanstack/react-query'
import type { UnitSystem } from '../../lib/units'
import { heroNextChange, heroSelection, justServed, useCouldntPlan, useHeroClock, useLeftovers, usePlan, useToConfirm, withJustServed } from '../plan'
import { notServedToday } from '../plan/lib/slotDate'
import type { HeroAction, HeroDay } from '../plan'
import type { Leftover, PlanEntry, PlanSlot } from '../plan/types'
import { useAllLots, useSpoiledLots, useStockTotals } from '../stock'
import type { StockLot, WasteRecord } from '../stock/types'
import { useSoonItems } from './lib/useSoon'
import type { UseSoonItem } from './types'

/** T13: true while the Scan screen is open in Shop mode. B9-44: Today no longer reads it (the Shopping tile reads the persisted session in
 * shoppingSeam.ts); kept for the callers and mocks that still name it. */
export { useScanSessionActive } from '../scan'

export interface TodayPlanCounts {
  /** Household date (YYYY-MM-DD), for the date under the title. */
  today: string
  /** A Planned Meal to show, or a Meal Slot Not served today (its compact row takes the Tonight place). */
  hasNextMeal: boolean
  toConfirm: number
  couldntPlan: number
  leftovers: number
  loading: boolean
  failed?: boolean
  /** B9-39: offline, the plan never loaded (Today shows its LoadState). */
  offlineUnknown?: boolean
  retry?: () => void
}

export interface TodayStock {
  spoiled: number
  useSoon: UseSoonItem[]
  loading: boolean
  failed?: boolean
}

export interface SpoiledCalls {
  throwOut: (lotId: number) => Promise<WasteRecord>
  keep: (lotId: number, goodUntil?: string) => Promise<StockLot>
  undoThrowOut: (wasteId: number) => Promise<unknown>
  undoKeep: (lotId: number, goesOff: string | null) => Promise<unknown>
}

/** Everything the Today tiles display, read from the owning features. */
export interface TodayTileData {
  /** The clock the hero is judged by (B9-39: useHeroClock, so the hero moves on at the slot time without a reload). */
  now: Date
  nextSlot: PlanSlot | null
  /** N3: which day the hero meal is on and what it offers (absent = today, Cook). */
  nextDay?: HeroDay
  nextAction?: HeroAction
  /** B9-39 (TB-01): the just-served rows first (today's slots whose time has come), then the server's. */
  toConfirm: PlanEntry[]
  /** B9-39 (TB-01): today's slots whose time has come that still have a Course to cook (the first part of `toConfirm`). */
  justServed: PlanEntry[]
  couldntPlan: PlanEntry[]
  /** R13: the whole plan, so "every dinner" is measured against it. */
  planSlots?: PlanSlot[]
  /** B5-F1: today's Meal Slots that are Not served (plan lib/slotDate notServedToday): the Tonight tile shows each as a compact row. */
  notServedToday?: PlanSlot[]
  leftovers: Leftover[]
  planToday: string
  spoiled: StockLot[]
  stockToday: string
  system: UnitSystem
  useSoon: UseSoonItem[]
  throwOut: (lotId: number) => Promise<void>
  keep: (lotId: number) => Promise<void>
  /**
   * B9-44 (SAFE-09, SSP-17): the Pantry's calls, with their Undo calls, for useSpoiledFlow: throwOut resolves with the waste record, keep (no date =
   * good until today, a date = Change) with the kept Lot. `throwOut` and `keep` above stay for the callers that only need to act.
   */
  spoiledCalls?: SpoiledCalls
  planLoading: boolean
  stockLoading: boolean
  /** The plan or stock behind the tiles could not be loaded and nothing is held, online (a server error). */
  loadFailed?: boolean
  /** B9-39 (RES-02): offline and the plan was never loaded on this phone: Today shows its LoadState, never an error. */
  offlineUnknown?: boolean
  retry?: () => void
}

/** T11 and T10 data for the Today tiles. */
export function useTodayTileData(): TodayTileData {
  const plan = usePlan()
  const now = useHeroClock((at) => heroNextChange(plan.slots, at, plan.today))
  const toConfirm = useToConfirm()
  const couldntPlan = useCouldntPlan()
  const leftovers = useLeftovers()
  const spoiled = useSpoiledLots()
  const totals = useStockTotals()
  const lots = useAllLots()
  const client = useQueryClient()
  // Offline with nothing held is not a failure (a Try again could not work): the plan's offlineUnknown is the LoadState, and Stock
  // that was never loaded simply shows no tile.
  const failed = plan.failed || toConfirm.failed || couldntPlan.failed || leftovers.failed || spoiled.status === 'error' || totals.status === 'error'
  const hero = heroSelection(plan.slots, now, plan.today)
  const served = justServed(plan.slots, now, plan.today)
  return {
    now,
    nextSlot: hero?.slot ?? null,
    nextDay: hero?.day,
    nextAction: hero?.action,
    toConfirm: withJustServed(served, toConfirm.slots),
    justServed: served,
    couldntPlan: couldntPlan.slots,
    planSlots: plan.slots,
    notServedToday: notServedToday(plan.slots, plan.today),
    leftovers: leftovers.leftovers,
    planToday: plan.today,
    spoiled: spoiled.data ?? [],
    stockToday: spoiled.today ?? plan.today,
    system: totals.system,
    // RES-05: Use soon waits for the Household date the plan gives (never the device's, never ''); TB-11: it names the soonest Lot.
    useSoon: plan.today === '' ? [] : useSoonItems(totals.data ?? [], plan.today, lots.data ?? []),
    // B9-29: useSpoiledLots now resolves with the waste record and the kept Lot (for the Pantry's Undo); Today keeps its void calls.
    throwOut: (lotId) => spoiled.throwOut(lotId).then(() => undefined),
    keep: (lotId) => spoiled.keep(lotId).then(() => undefined),
    spoiledCalls: { throwOut: spoiled.throwOut, keep: spoiled.keep, undoThrowOut: spoiled.undoThrowOut, undoKeep: spoiled.undoKeep },
    planLoading: plan.isLoading || toConfirm.isLoading || couldntPlan.isLoading || leftovers.isLoading,
    stockLoading: spoiled.isLoading || totals.isLoading,
    loadFailed: failed,
    offlineUnknown: plan.state === 'offlineUnknown',
    // Everything Today reads: the plan (view, to-confirm, couldn't-plan, leftovers), Stock (spoiled, totals) and
    // Today's own queries (the streak, advance steps).
    retry: () => {
      for (const queryKey of [['plan'], ['stock'], ['today']]) void client.invalidateQueries({ queryKey })
    },
  }
}

/** The plan counts the layout needs. */
export function useTodayPlan(): TodayPlanCounts {
  const d = useTodayTileData()
  return {
    today: d.planToday,
    hasNextMeal: d.nextSlot !== null || (d.notServedToday ?? []).length > 0,
    toConfirm: d.toConfirm.length,
    couldntPlan: d.couldntPlan.length,
    leftovers: d.leftovers.length,
    loading: d.planLoading,
    failed: d.loadFailed === true,
    offlineUnknown: d.offlineUnknown === true,
    retry: d.retry,
  }
}

/** The stock counts the layout needs. */
export function useTodayStock(): TodayStock {
  const d = useTodayTileData()
  return { spoiled: d.spoiled.length, useSoon: d.useSoon, loading: d.stockLoading, failed: d.loadFailed === true }
}

// The seams where Today reads other features: Planning (T11), Stock (T10) and the
// scan session (T13). Tests mock this module. Only this file imports other
// features' hooks, so Today's own components and hooks stay decoupled.
import { useQueryClient } from '@tanstack/react-query'
import type { UnitSystem } from '../../lib/units'
import { heroSelection, useCouldntPlan, useLeftovers, usePlan, useToConfirm } from '../plan'
import type { HeroAction, HeroDay } from '../plan'
import type { Leftover, PlanEntry, PlanSlot } from '../plan/types'
import { useSpoiledLots, useStockTotals } from '../stock'
import type { StockLot } from '../stock/types'
import { ShoppingScreen } from '../shop'
import { useSoonItems } from './lib/useSoon'
import type { UseSoonItem } from './types'

/** T13: true while a scan session is active (Today then shows the Shopping List instead of the tiles). */
export { useScanSessionActive } from '../scan'

/** T13: the Shopping List screen Today shows during a scan session. */
export const ShoppingListSeam = ShoppingScreen

export interface TodayPlanCounts {
  /** Household date (YYYY-MM-DD), for the date under the title. */
  today: string
  hasNextMeal: boolean
  toConfirm: number
  couldntPlan: number
  leftovers: number
  loading: boolean
  failed?: boolean
  retry?: () => void
}

export interface TodayStock {
  spoiled: number
  useSoon: UseSoonItem[]
  loading: boolean
  failed?: boolean
}

/** Everything the Today tiles display, read from the owning features. */
export interface TodayTileData {
  /** The clock the hero judges 'upcoming' or 'awaiting' by. */
  now: Date
  nextSlot: PlanSlot | null
  /** N3: which day the hero meal is on and what it offers (absent = today, Cook). */
  nextDay?: HeroDay
  nextAction?: HeroAction
  toConfirm: PlanEntry[]
  couldntPlan: PlanEntry[]
  /** R13: the whole plan, so "every dinner" is measured against it. */
  planSlots?: PlanSlot[]
  leftovers: Leftover[]
  planToday: string
  spoiled: StockLot[]
  stockToday: string
  system: UnitSystem
  useSoon: UseSoonItem[]
  throwOut: (lotId: number) => Promise<void>
  keep: (lotId: number) => Promise<void>
  planLoading: boolean
  stockLoading: boolean
  /** The plan or stock behind the tiles could not be loaded and nothing is held (offline, server error). */
  loadFailed?: boolean
  retry?: () => void
}

/** T11 and T10 data for the Today tiles. */
export function useTodayTileData(): TodayTileData {
  const now = new Date()
  const plan = usePlan()
  const toConfirm = useToConfirm()
  const couldntPlan = useCouldntPlan()
  const leftovers = useLeftovers()
  const spoiled = useSpoiledLots()
  const totals = useStockTotals()
  const client = useQueryClient()
  const failed = plan.failed || toConfirm.failed || couldntPlan.failed || leftovers.failed || spoiled.status === 'error' || spoiled.status === 'offline' || totals.status === 'error' || totals.status === 'offline'
  const hero = heroSelection(plan.slots, now, plan.today)
  return {
    now,
    nextSlot: hero?.slot ?? null,
    nextDay: hero?.day,
    nextAction: hero?.action,
    toConfirm: toConfirm.slots,
    couldntPlan: couldntPlan.slots,
    planSlots: plan.slots,
    leftovers: leftovers.leftovers,
    planToday: plan.today,
    spoiled: spoiled.data ?? [],
    stockToday: spoiled.today ?? plan.today,
    system: totals.system,
    useSoon: useSoonItems(totals.data ?? [], plan.today),
    throwOut: spoiled.throwOut,
    keep: spoiled.keep,
    planLoading: plan.isLoading || toConfirm.isLoading || couldntPlan.isLoading || leftovers.isLoading,
    stockLoading: spoiled.isLoading || totals.isLoading,
    loadFailed: failed,
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
    hasNextMeal: d.nextSlot !== null,
    toConfirm: d.toConfirm.length,
    couldntPlan: d.couldntPlan.length,
    leftovers: d.leftovers.length,
    loading: d.planLoading,
    failed: d.loadFailed === true,
    retry: d.retry,
  }
}

/** The stock counts the layout needs. */
export function useTodayStock(): TodayStock {
  const d = useTodayTileData()
  return { spoiled: d.spoiled.length, useSoon: d.useSoon, loading: d.stockLoading, failed: d.loadFailed === true }
}

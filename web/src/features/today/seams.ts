// The seams where Today reads other features: Planning (T11), Stock (T10) and the
// scan session (T13). Tests mock this module. Only this file imports other
// features' hooks, so Today's own components and hooks stay decoupled.
import type { UnitSystem } from '../../lib/units'
import { heroSelection, useCouldntPlan, useLeftovers, usePlan, useToConfirm } from '../plan'
import type { HeroAction, HeroDay } from '../plan'
import type { Leftover, PlanSlot } from '../plan/types'
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
}

export interface TodayStock {
  spoiled: number
  useSoon: UseSoonItem[]
  loading: boolean
}

/** Everything the Today tiles display, read from the owning features. */
export interface TodayTileData {
  /** The clock the hero judges 'upcoming' or 'awaiting' by. */
  now: Date
  nextSlot: PlanSlot | null
  /** N3: which day the hero meal is on and what it offers (absent = today, Cook). */
  nextDay?: HeroDay
  nextAction?: HeroAction
  toConfirm: PlanSlot[]
  couldntPlan: PlanSlot[]
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
  const hero = heroSelection(plan.slots, now, plan.today)
  return {
    now,
    nextSlot: hero?.slot ?? null,
    nextDay: hero?.day,
    nextAction: hero?.action,
    toConfirm: toConfirm.slots,
    couldntPlan: couldntPlan.slots,
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
  }
}

/** The stock counts the layout needs. */
export function useTodayStock(): TodayStock {
  const d = useTodayTileData()
  return { spoiled: d.spoiled.length, useSoon: d.useSoon, loading: d.stockLoading }
}

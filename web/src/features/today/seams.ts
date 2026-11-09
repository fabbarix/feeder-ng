// The seams where Today reads other features. Each stub below is replaced by the
// owning feature's export when that feature is merged (docs/dev/design/t15-notify-ops-today.md,
// "Seams"). Tests mock this module.
import type { UseSoonItem } from './types'

/** T13: true while a scan session is active. Replace with the export from `features/scan`. */
export function useScanSessionActive(): boolean {
  return false
}

export interface TodayPlanCounts {
  hasNextMeal: boolean
  toConfirm: number
  couldntPlan: number
  leftovers: number
  loading: boolean
}

/** T11: derive from `usePlan`, `useToConfirm`, `useCouldntPlan`, `useLeftovers` and `nextMeal`. */
export function useTodayPlan(): TodayPlanCounts {
  return { hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false }
}

export interface TodayStock {
  spoiled: number
  useSoon: UseSoonItem[]
  loading: boolean
}

/** T10: derive from `useSpoiledLots` and `useStockTotals` (use-soon Ingredients). */
export function useTodayStock(): TodayStock {
  return { spoiled: 0, useSoon: [], loading: false }
}

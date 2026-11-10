import { useQuery } from '@tanstack/react-query'
import { todayApi } from '../api'
import { composeToday } from '../lib/compose'
import { useScanSessionActive, useTodayPlan, useTodayStock } from '../seams'
import type { AdvanceStepDue, TodayLayout } from '../types'

export interface UseToday {
  layout: TodayLayout
  loading: boolean
}

/**
 * Today's data: the scan-session flag and the plan and stock counts (seams), plus
 * Advance Steps due and the zero-waste streak (this feature's API), composed with
 * composeToday. A failing own endpoint counts as nothing to show.
 */
export function useToday(): UseToday {
  const scanSessionActive = useScanSessionActive()
  const plan = useTodayPlan()
  const stock = useTodayStock()
  const steps = useAdvanceStepsDue()
  const streak = useZeroWasteStreak()
  const layout = composeToday({
    scanSessionActive,
    hasNextMeal: plan.hasNextMeal,
    spoiled: stock.spoiled,
    advanceSteps: steps.steps.length,
    toConfirm: plan.toConfirm,
    couldntPlan: plan.couldntPlan,
    leftovers: plan.leftovers,
    useSoon: stock.useSoon.length,
    streakDays: streak.days,
  })
  return { layout, loading: plan.loading || stock.loading || steps.loading || streak.loading }
}

export interface AdvanceStepsState {
  steps: AdvanceStepDue[]
  loading: boolean
}

const NO_STEPS: AdvanceStepDue[] = []

/** GET /api/today/advance-steps via react-query, refreshed each minute so "Now" appears on time. */
export function useAdvanceStepsDue(): AdvanceStepsState {
  const q = useQuery({
    queryKey: ['today', 'advance-steps'],
    queryFn: () => todayApi.advanceSteps(),
    refetchInterval: 60_000,
  })
  return { steps: q.data?.steps ?? NO_STEPS, loading: q.isLoading }
}

/** GET /api/today/streak: the zero-waste streak in days (0 while loading or on failure). */
export function useZeroWasteStreak(): { days: number; loading: boolean } {
  const q = useQuery({ queryKey: ['today', 'streak'], queryFn: () => todayApi.streak() })
  return { days: q.data?.days ?? 0, loading: q.isLoading }
}

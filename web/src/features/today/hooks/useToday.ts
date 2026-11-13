import { useQuery } from '@tanstack/react-query'
import { todayApi } from '../api'
import { composeToday } from '../lib/compose'
import { needsSetup } from '../lib/setup'
import { useScanSessionActive, useTodayPlan, useTodayStock } from '../seams'
import { useLinesToGet } from '../shopSeam'
import { useSetupFacts } from '../setupSeam'
import type { AdvanceStepDue, TodayLayout } from '../types'

const noop = (): void => {}

export interface UseToday {
  layout: TodayLayout
  /** Household date, YYYY-MM-DD ('' until the plan has loaded). */
  today: string
  loading: boolean
  /** Refetch what failed. */
  retry: () => void
}

/**
 * Today's data: the scan-session flag and the plan and stock counts (seams), plus
 * Advance Steps due, the zero-waste streak (this feature's API) and the Lines to get (the Shop seam), composed with
 * composeToday. A failing own endpoint counts as nothing to show.
 */
export function useToday(): UseToday {
  const scanSessionActive = useScanSessionActive()
  const plan = useTodayPlan()
  const stock = useTodayStock()
  const steps = useAdvanceStepsDue()
  const streak = useZeroWasteStreak()
  const lines = useLinesToGet()
  const setup = useSetupFacts()
  const layout = composeToday({
    scanSessionActive,
    hasNextMeal: plan.hasNextMeal,
    spoiled: stock.spoiled,
    advanceSteps: steps.steps.length,
    toConfirm: plan.toConfirm,
    couldntPlan: plan.couldntPlan,
    needsSetup: needsSetup(setup.facts),
    leftovers: plan.leftovers,
    useSoon: stock.useSoon.length,
    streakDays: streak.days,
    linesToGet: lines.count,
    loadFailed: plan.failed === true || stock.failed === true,
  })
  return { layout, retry: plan.retry ?? noop, today: plan.today, loading: plan.loading || stock.loading || steps.loading || streak.loading || lines.loading || setup.loading }
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

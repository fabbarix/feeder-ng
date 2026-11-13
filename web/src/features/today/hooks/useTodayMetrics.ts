// DS-TODAY: the hook behind the metric strip. Logic here, not in the component: the streak (Today's API), the Leftovers count
// (from the plan, passed in) and the Lines to get (the Shop seam) are composed by lib/metrics composeMetrics.
import { composeMetrics, type Metric } from '../lib/metrics'
import { useLinesToGet } from '../shopSeam'
import { useZeroWasteStreak } from './useToday'

export interface TodayMetrics {
  metrics: Metric[]
  /** True until both the streak and the Shop list have answered. */
  loading: boolean
}

/** `leftoversTile`: the Leftovers tile is on screen, so the strip leaves its Leftovers metric out. */
export function useTodayMetrics(leftovers: number, leftoversTile = false): TodayMetrics {
  const streak = useZeroWasteStreak()
  const lines = useLinesToGet()
  return {
    metrics: composeMetrics({ streakDays: streak.days, leftovers, linesToGet: lines.count, leftoversTile }),
    loading: streak.loading || lines.loading,
  }
}

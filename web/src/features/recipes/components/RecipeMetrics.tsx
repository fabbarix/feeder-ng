import type { ReactNode } from 'react'

export interface RecipeMetricsProps {
  yieldText: string
  readyMeal: boolean
  totalMinutes: number
  advanceMinutes: number
}

/**
 * The two metric Tiles of Recipe detail (ui/TileMetric): "4 portions per Batch" (plus a Ready Meal chip) and the time
 * (lib/timeSummary): "45 min cooking" with "+ 4 h ahead" beneath when an Advance Step exists, or "No Steps".
 */
export function RecipeMetrics(props: RecipeMetricsProps): ReactNode {
  void props
  return null
}

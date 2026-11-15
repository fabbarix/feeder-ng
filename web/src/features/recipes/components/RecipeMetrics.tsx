import type { ReactNode } from 'react'
import { BentoGrid, Tile, TileMetric } from '../../../ui'
import { metricsOf } from '../lib/metrics'

export interface RecipeMetricsProps {
  /** The Yield: portions per Batch, or a Base recipe's amount in `yieldUnit`. */
  yieldValue: number
  /** RX-06: a Base recipe's Yield unit. */
  yieldUnit?: string | null
  /** RX-06: true for a Base recipe ("800 g per Batch"). */
  baseRecipe?: boolean
  /** RX-07: the number of Steps (untimed Steps are not "No Steps"). */
  stepCount?: number
  totalMinutes: number
  advanceMinutes: number
  /** Beta.5 F7: the "Last cooked ..." / "Not cooked yet" line (lib/lastCooked), already worded. */
  lastCooked?: string
}

/**
 * RX-13: the metric strip of Recipe detail: two surface Tiles of value and label (TileMetric), never accent-soft. The Yield ("4" /
 * "portions per Batch", "800 g" / "per Batch") and the time ("37 min" / "cooking", "No time set" / "2 Steps, none timed", or "No Steps"),
 * then muted meta lines ("+ 12 h ahead", "Not cooked yet"). The words come from lib/metrics.
 */
export function RecipeMetrics({ lastCooked, ...facts }: RecipeMetricsProps): ReactNode {
  const m = metricsOf(facts)
  return (
    <BentoGrid min="metric">
      <Tile>
        <TileMetric value={m.yield.value} label={m.yield.label} />
      </Tile>
      <Tile>
        <TileMetric value={m.time.value} label={m.time.label} />
        {m.ahead ? <p className="recipe-metric__ahead">{m.ahead}</p> : null}
        {lastCooked ? <p className="recipe-metric__ahead">{lastCooked}</p> : null}
      </Tile>
    </BentoGrid>
  )
}

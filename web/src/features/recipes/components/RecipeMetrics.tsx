import type { ReactNode } from 'react'
import { BentoGrid, Chip, Tile } from '../../../ui'
import { formatMinutes } from '../lib/time'
import { timeSummary } from '../lib/timeSummary'
import { recipeStrings } from '../strings'

export interface RecipeMetricsProps {
  yieldText: string
  readyMeal: boolean
  totalMinutes: number
  advanceMinutes: number
  /** Beta.5 F7: the "Last cooked ..." / "Not cooked yet" line (lib/lastCooked), already worded. */
  lastCooked?: string
}

/**
 * The two metric Tiles of Recipe detail: "4 portions per Batch" (plus a Ready Meal chip) and the time
 * (lib/timeSummary): "25 min cooking" with "+ 4 h ahead" beneath when an Advance Step exists, or "No Steps".
 */
export function RecipeMetrics({ yieldText, readyMeal, totalMinutes, advanceMinutes }: RecipeMetricsProps): ReactNode {
  const time = timeSummary({ totalMinutes, advanceMinutes })
  const ahead = time.ahead ? recipeStrings.aheadMetric(formatMinutes(advanceMinutes)) : null
  return (
    <BentoGrid columns={2}>
      <Tile variant="soft">
        <p className="recipe-metric">{recipeStrings.portionsPerBatch(yieldText)}</p>
        {readyMeal ? <Chip kind="tag">{recipeStrings.readyMeal}</Chip> : null}
      </Tile>
      <Tile variant="soft">
        {time.total ? <p className="recipe-metric">{recipeStrings.totalMetric(time.total)}</p> : null}
        {/* An Advance Step alone has no total: its lead is the metric, and "No Steps" is not said beside it. */}
        {!time.total && ahead ? <p className="recipe-metric">{ahead}</p> : null}
        {!time.total && !ahead ? <p className="recipe-metric">{recipeStrings.noSteps}</p> : null}
        {time.total && ahead ? <p className="recipe-metric__ahead">{ahead}</p> : null}
      </Tile>
    </BentoGrid>
  )
}

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
}

/**
 * The two metric Tiles of Recipe detail: "4 portions per Batch" (plus a Ready Meal chip) and the time
 * (lib/timeSummary): "25 min cooking" with "+ 4 h ahead" beneath when an Advance Step exists, or "No Steps".
 */
export function RecipeMetrics({ yieldText, readyMeal, totalMinutes, advanceMinutes }: RecipeMetricsProps): ReactNode {
  const time = timeSummary({ totalMinutes, advanceMinutes })
  return (
    <BentoGrid columns={2}>
      <Tile variant="soft">
        <p className="recipe-metric">{recipeStrings.portionsPerBatch(yieldText)}</p>
        {readyMeal ? <Chip kind="tag">{recipeStrings.readyMeal}</Chip> : null}
      </Tile>
      <Tile variant="soft">
        <p className="recipe-metric">{time.total ? recipeStrings.totalMetric(time.total) : recipeStrings.noSteps}</p>
        {time.ahead ? <p className="recipe-metric__ahead">{recipeStrings.aheadMetric(formatMinutes(advanceMinutes))}</p> : null}
      </Tile>
    </BentoGrid>
  )
}

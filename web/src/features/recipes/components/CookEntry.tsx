import type { ReactNode } from 'react'
import { Button, Stepper } from '../../../ui'
import { batchPortions, MAX_BATCHES, MIN_BATCHES } from '../lib/cookEntry'
import { recipeStrings } from '../strings'

export interface CookEntryProps {
  batches: number
  onBatchesChange: (n: number) => void
  /** Yield of the Recipe (portions per Batch); the hint multiplies it with lib/cookEntry.batchPortions. */
  yieldValue: number
  /** RX-06 (B9-27 stub: type only): the Yield's unit of a Base recipe ('g', 'l', 'portion'...); absent for a plannable Recipe. */
  yieldUnit?: string | null
  /** RX-06 (B9-27 stub: type only): the User's display units for the hint. Default 'metric'. */
  system?: 'metric' | 'imperial'
  onStart: () => void
}

/**
 * The Cook / Batch entry (QA B2, G2): a ui/Stepper named "Batches" (min/max from lib/cookEntry), the line
 * strings.cook.batchesHint and a primary Button "Start Cook Mode". Plain content: the StickyActionBar (below 1280 px) or the left column (from 1280 px) carries it.
 */
export function CookEntry({ batches, onBatchesChange, yieldValue, onStart }: CookEntryProps): ReactNode {
  return (
    <div className="cook-entry">
      <div className="cook-entry__batches">
        <Stepper
          size="sm"
          label={recipeStrings.cook.batches}
          value={batches}
          onChange={onBatchesChange}
          min={MIN_BATCHES}
          max={MAX_BATCHES}
        />
        <p className="cook-entry__hint">{recipeStrings.cook.batchesHint(batches, batchPortions(yieldValue, batches))}</p>
      </div>
      <Button size="lg" onClick={onStart}>
        {recipeStrings.cook.start}
      </Button>
    </div>
  )
}

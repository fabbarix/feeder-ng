import type { ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { formatLeadTime, type AdvanceSummary } from '../lib/advance'
import { cookStrings } from '../strings'
import { BaseRecipeChip } from './BaseRecipeChip'

export interface AdvanceStepsTileProps {
  summary: AdvanceSummary
  /** Marks the Advance Step with this Recipe Step index as done. */
  onMarkDone: (stepIndex: number) => void
}

/**
 * The spoil status tile of Advance Steps: each pending one as "<text> · <lead time> ahead" with a "Done" button; the
 * done ones as "Done: <text>". Renders nothing when nothing is pending (Cook Mode shows it only before Step 1, see
 * lib/advance.advanceOnScreen).
 */
export function AdvanceStepsTile({ summary, onMarkDone }: AdvanceStepsTileProps): ReactNode {
  if (summary.pending.length === 0) return null
  return (
    <Tile as="section" variant="status" status="spoil" span="full" className="cook-advance">
      <h2 className="cook-advance__heading">{cookStrings.advanceHeading}</h2>
      <ul className="cook-advance__list">
        {summary.done.map((item) => (
          <li key={item.step} className="cook-advance__done">
            <p>{cookStrings.advanceDone(item.text)}</p>
            {item.baseRecipe ? <BaseRecipeChip recipe={item.baseRecipe} /> : null}
          </li>
        ))}
        {summary.pending.map((item) => (
          <li key={item.step} className="cook-advance__row">
            <div className="cook-advance__text">
              <p>{cookStrings.advanceAhead(item.text, formatLeadTime(item.leadTimeMinutes))}</p>
              {item.baseRecipe ? <BaseRecipeChip recipe={item.baseRecipe} /> : null}
            </div>
            <Button variant="secondary" size="sm" onClick={() => onMarkDone(item.step)}>
              {cookStrings.markAdvanceDoneShort}
            </Button>
          </li>
        ))}
      </ul>
    </Tile>
  )
}

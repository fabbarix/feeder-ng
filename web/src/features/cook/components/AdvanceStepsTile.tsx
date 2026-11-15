import type { ReactNode } from 'react'
import { Icon, Tile } from '../../../ui'
import { advanceLine, type AdvanceSummary } from '../lib/advance'
import { cookStrings } from '../strings'
import { AdvanceChip, AdvanceLine, AdvanceRows, type AdvanceRowItem } from './AdvanceParts'

export interface AdvanceStepsTileProps {
  summary: AdvanceSummary
  /** Marks the Advance Step with this Recipe Step index as done. */
  onMarkDone: (stepIndex: number) => void
  /** B9-40 (SHORT-01): short landscape shows a chip that opens the Advance Steps in a sheet, not the tile. */
  compact?: boolean
  /** B9-40 (PC-03): on a Step after the first the Advance Steps are one info line. */
  collapsed?: boolean
}

function rows(summary: AdvanceSummary, onMarkDone: (step: number) => void): AdvanceRowItem[] {
  return [...summary.done, ...summary.pending].map((item) => ({
    key: String(item.step),
    text: item.text,
    done: item.done,
    leadTimeMinutes: item.leadTimeMinutes,
    baseRecipe: item.baseRecipe,
    onMarkDone: () => onMarkDone(item.step),
  }))
}

/**
 * The Advance Steps of a Recipe cook, in the info tone (DS 3: lateness is never red, peach or mustard). On Step 1 an info status
 * tile with its rows (done ones "Done: <text>", pending ones "<text> · <lead time> ahead" with a "Done" button), shown while one is
 * pending. `collapsed` (a later Step): one info line (lib/advance advanceLine). `compact` (short landscape): the chip and its sheet.
 */
export function AdvanceStepsTile({ summary, onMarkDone, compact = false, collapsed = false }: AdvanceStepsTileProps): ReactNode {
  if (compact) {
    return (
      <AdvanceChip pending={summary.pending.length}>
        <AdvanceRows label={cookStrings.advanceHeading} items={rows(summary, onMarkDone)} />
      </AdvanceChip>
    )
  }
  if (collapsed) return <AdvanceLine text={advanceLine(summary)} />
  if (summary.pending.length === 0) return null
  return (
    <Tile as="section" variant="status" status="info" span="full" className="cook-advance">
      <h2 className="cook-advance__heading">
        <Icon name="advanceStep" size={16} />
        {cookStrings.advanceHeading}
      </h2>
      <AdvanceRows label={cookStrings.advanceHeading} items={rows(summary, onMarkDone)} />
    </Tile>
  )
}

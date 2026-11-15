import { useId, type ReactNode } from 'react'
import { Button, Stepper } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { batchAmountText, MAX_BATCHES, MIN_BATCHES } from '../lib/cookEntry'
import { recipeStrings } from '../strings'

export interface CookEntryProps {
  batches: number
  onBatchesChange: (n: number) => void
  /** The Recipe's Yield: portions per Batch, or a Base recipe's amount in `yieldUnit`. */
  yieldValue: number
  /** RX-06: the Yield's unit of a Base recipe ('g', 'l', 'portion'...); absent or null for a plannable Recipe (portions). */
  yieldUnit?: string | null
  /** RX-06: the User's display units for the hint. Default 'metric'. */
  system?: UnitSystem
  /** Where it sits: the StickyActionBar's one row (default), or the Cook tile, which stacks it and takes the larger button. */
  placement?: 'bar' | 'tile'
  onStart: () => void
}

/**
 * The Cook / Batch entry (QA B2, G2; SHORT-04): a ui/Stepper named "Batches", its hint ("2 Batches · 1.6 kg", the Stepper's description,
 * so a short viewport can hide the line and keep the words) and a primary Button named "Start Cook Mode", which reads "Cook" at 375 px and
 * below. Plain content: the StickyActionBar or the Cook tile carries it.
 */
export function CookEntry({ batches, onBatchesChange, yieldValue, yieldUnit, system = 'metric', placement = 'bar', onStart }: CookEntryProps): ReactNode {
  const hintId = useId()
  const t = recipeStrings.cook
  return (
    <div className="cook-entry" data-placement={placement}>
      <div className="cook-entry__batches">
        <Stepper size="sm" label={t.batches} value={batches} onChange={onBatchesChange} min={MIN_BATCHES} max={MAX_BATCHES} describedBy={hintId} />
        <p id={hintId} className="cook-entry__hint">
          {t.batchesHint(batches, batchAmountText(yieldValue, yieldUnit, batches, system))}
        </p>
      </div>
      <Button size={placement === 'tile' ? 'lg' : 'md'} onClick={onStart} aria-label={t.start}>
        <span className="cook-entry__long">{t.start}</span>
        <span className="cook-entry__short" aria-hidden="true">
          {t.short}
        </span>
      </Button>
    </div>
  )
}

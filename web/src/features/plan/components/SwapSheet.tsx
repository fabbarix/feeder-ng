import type { ReactNode } from 'react'
import { BottomSheet, Button, Chip, WhyChip } from '../../../ui'
import { phraseAll } from '../lib/phrase'
import { planStrings } from '../strings'
import type { Alternative, PlanSlot } from '../types'
import '../plan.css'

export interface SwapSheetProps {
  open: boolean
  onClose: () => void
  /** The slot being swapped (its date words the why chips). */
  slot: PlanSlot | null
  alternatives: Alternative[]
  isLoading: boolean
  onPick: (recipeId: number) => void
}

/** Bottom sheet with the top 3 alternatives, each with its phrased why chips; choosing one pins it. */
export function SwapSheet({ open, onClose, slot, alternatives, isLoading, onPick }: SwapSheetProps): ReactNode {
  const slotDate = slot?.date ?? ''
  return (
    <BottomSheet open={open} onClose={onClose} title={planStrings.swapTitle}>
      <div className="plan__stack">
        <p className="plan__muted">{planStrings.swapHelp}</p>
        {isLoading ? <p className="plan__muted">{planStrings.swapLoading}</p> : null}
        {!isLoading && alternatives.length === 0 ? <p className="plan__muted">{planStrings.swapNone}</p> : null}
        <ul className="plan__list">
          {alternatives.map((a) => (
            <li key={a.recipeId}>
              <div className="plan__stack">
                <p className="plan-meal__recipe">{a.recipeName}</p>
                <div className="plan__row">
                  <Chip>{planStrings.batches(a.batches)}</Chip>
                  {a.newLeftoverPortions > 0 ? (
                    <Chip tone="leftover">{planStrings.extraPortions(a.newLeftoverPortions)}</Chip>
                  ) : null}
                  {phraseAll(a.why, { slotDate }).map((p) => (
                    <WhyChip key={p} reason={p} />
                  ))}
                </div>
              </div>
              <Button variant="tonal" aria-label={planStrings.swapPick(a.recipeName)} onClick={() => onPick(a.recipeId)}>
                {planStrings.swap}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  )
}

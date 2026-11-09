import type { ReactNode } from 'react'
import { BottomSheet, Button, Chip, Stepper } from '../../../ui'
import { LEFTOVER_STEP, formatPortions } from '../lib/cook'
import { weekdayName } from '../lib/phrase'
import { planStrings } from '../strings'
import type { CookPreview } from '../types'
import '../plan.css'

export interface MarkCookedSheetProps {
  open: boolean
  onClose: () => void
  preview: CookPreview | null
  isLoading: boolean
  leftover: number
  onLeftoverChange: (next: number) => void
  onConfirm: () => void
  onNotCooked: () => void
  busy: boolean
  error: string | null
}

/**
 * "Mark as Cooked": shows the Recipe, what the Batches make against what is needed, and (for a freshly cooked meal) a
 * ± Stepper for the Leftover portions in half steps with the Use-by it would get. "Not cooked" is the other way out.
 */
export function MarkCookedSheet(props: MarkCookedSheetProps): ReactNode {
  const { open, onClose, preview, isLoading, leftover, onLeftoverChange, onConfirm, onNotCooked, busy, error } = props
  return (
    <BottomSheet open={open} onClose={onClose} title={planStrings.cookedTitle}>
      <div className="plan__stack">
        {isLoading || !preview ? <p className="plan__muted">{planStrings.loading}</p> : null}
        {preview ? (
          <>
            <p className="plan-meal__recipe">{preview.meal.recipeName}</p>
            {preview.fresh ? (
              <>
                <p className="plan__muted">
                  {`${planStrings.makes(planStrings.batches(preview.batches), formatPortions(preview.batches * preview.yield))}, ${planStrings.needed(formatPortions(preview.portionsNeeded))}`}
                </p>
                <p className="plan-meal__slot">{planStrings.cookedQuestion}</p>
                <Stepper
                  label={planStrings.leftoverLabel}
                  value={leftover}
                  onChange={onLeftoverChange}
                  min={0}
                  max={preview.maxLeftover}
                  step={LEFTOVER_STEP}
                />
                {leftover > 0 ? (
                  <Chip tone="leftover">{planStrings.leftoverUseBy(weekdayName(preview.leftoverUseBy))}</Chip>
                ) : (
                  <Chip>{planStrings.noLeftover}</Chip>
                )}
              </>
            ) : (
              <p className="plan__muted">{planStrings.fromLeftoverNote}</p>
            )}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="plan__error">
            {error}
          </p>
        ) : null}
        <div className="plan__row">
          <Button disabled={busy || !preview} onClick={onConfirm}>
            {planStrings.confirmCooked}
          </Button>
          <Button variant="ghost" disabled={busy || !preview} onClick={onNotCooked}>
            {planStrings.notCooked}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

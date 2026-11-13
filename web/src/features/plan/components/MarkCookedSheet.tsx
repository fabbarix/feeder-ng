import type { ReactNode } from 'react'
import { BottomSheet, Button, Chip, NumberField } from '../../../ui'
import { LEFTOVER_STEP, formatPortions } from '../lib/cook'
import { weekdayName } from '../lib/phrase'
import { planStrings } from '../strings'
import type { CookPreview } from '../types'
import type { UsedFromController } from '../hooks/useUsedFrom'
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
  /** The Used from picks (below the Leftover stepper). Optional until wired (b5-ufw). */
  usedFrom?: UsedFromController
}

/**
 * "Mark as Cooked": shows the Recipe, what the Batches yield against what is needed, and (for a freshly cooked meal) a
 * stepper for the Leftover portions in half steps with the Use-by it would get. The footer holds the actions: Mark as
 * Cooked (the one primary), No Leftover (while there is one) and Not cooked.
 */
export function MarkCookedSheet(props: MarkCookedSheetProps): ReactNode {
  const { open, onClose, preview, isLoading, leftover, onLeftoverChange, onConfirm, onNotCooked, busy, error } = props
  const fresh = preview?.fresh ?? false
  const footer = (
    <div className="plan-sheet__actions">
      <Button variant="primary" disabled={busy || !preview} onClick={onConfirm}>
        {planStrings.confirmCooked}
      </Button>
      {fresh && leftover > 0 ? (
        <Button variant="secondary" disabled={busy || !preview} onClick={() => onLeftoverChange(0)}>
          {planStrings.noLeftover}
        </Button>
      ) : null}
      <Button variant="tertiary" disabled={busy || !preview} onClick={onNotCooked}>
        {planStrings.notCooked}
      </Button>
    </div>
  )
  return (
    <BottomSheet open={open} onClose={onClose} title={planStrings.cookedTitle} footer={footer}>
      <div className="plan__stack">
        {isLoading || !preview ? <p className="plan__muted">{planStrings.loading}</p> : null}
        {preview ? (
          <>
            <p className="plan-sheet__recipe">{preview.meal.recipeName}</p>
            {fresh ? (
              <>
                <p className="plan__muted">
                  {`${planStrings.yield(planStrings.batches(preview.batches), formatPortions(preview.batches * preview.yield))}, ${planStrings.needed(formatPortions(preview.portionsNeeded))}`}
                </p>
                <p className="plan__muted">{planStrings.cookedQuestion}</p>
                <NumberField
                  label={planStrings.leftoverLabel}
                  value={leftover}
                  onChange={(v) => onLeftoverChange(v ?? 0)}
                  min={0}
                  max={preview.maxLeftover}
                  step={LEFTOVER_STEP}
                />
                {leftover > 0 ? (
                  <Chip kind="status" status="leftover">
                    {planStrings.leftoverUseBy(weekdayName(preview.leftoverUseBy, 'short'))}
                  </Chip>
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
      </div>
    </BottomSheet>
  )
}

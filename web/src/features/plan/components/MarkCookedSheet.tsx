import type { ReactNode } from 'react'
import { BottomSheet, Button, Chip, FormActions, NumberField } from '../../../ui'
import { LEFTOVER_STEP, formatPortions } from '../lib/cook'
import { weekdayName } from '../lib/phrase'
import { planStrings } from '../strings'
import type { CookPreview } from '../types'
import type { UsedFromController } from '../hooks/useUsedFrom'
import { CourseUsedFrom } from './CourseUsedFrom'
import { useSheetBodyFocus } from '../hooks/useSheetBodyFocus'
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
  /** The Course of the key, or null: the Used from row is for this Course. */
  courseId: number | null
  /** The Used from picks (below the Leftover stepper). */
  usedFrom: UsedFromController
}

/**
 * "Mark as Cooked": shows the Recipe, what the Batches yield against what is needed, and (for a freshly cooked meal) a
 * stepper for the Leftover portions in half steps with the Use-by it would get. The footer holds the actions: Mark as
 * Cooked (the one primary), No Leftover (while there is one) and, under the ⋮, Not cooked.
 */
export function MarkCookedSheet(props: MarkCookedSheetProps): ReactNode {
  const { open, onClose, preview, isLoading, leftover, onLeftoverChange, onConfirm, onNotCooked, busy, error, courseId, usedFrom } = props
  const fresh = preview?.fresh ?? false
  // B9-38 (SHORT-02): one FormActions row: ⋮ "More for <Recipe>" (Not cooked), No Leftover (while there is one), Mark as Cooked.
  const off = busy || !preview
  const footer = (
    <FormActions
      more={[{ id: 'notCooked', label: planStrings.notCooked, icon: 'notCooked', disabled: off, onSelect: off ? undefined : onNotCooked }]}
      moreLabel={planStrings.moreFor(preview?.meal.recipeName ?? planStrings.cookedTitle)}
      secondary={
        fresh && leftover > 0 ? (
          <Button variant="secondary" data-one-line="" disabled={off} onClick={() => onLeftoverChange(0)}>
            {planStrings.noLeftover}
          </Button>
        ) : undefined
      }
      primary={
        <Button variant="primary" data-one-line="" disabled={off} onClick={onConfirm}>
          {planStrings.confirmCooked}
        </Button>
      }
    />
  )
  const { bodyRef, focusRef } = useSheetBodyFocus<HTMLDivElement>('[role="spinbutton"]')
  return (
    <BottomSheet open={open} onClose={onClose} title={planStrings.cookedTitle} footer={footer} initialFocusRef={focusRef}>
      <div ref={bodyRef} className="plan__stack">
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
                {courseId !== null && usedFrom.lines(courseId).length > 0 ? <CourseUsedFrom usedFrom={usedFrom} courseId={courseId} /> : null}
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

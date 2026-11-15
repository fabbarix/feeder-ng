// B9-26 (PC-01): the sheet "What changed": the edit as its context line, a lede, the changed meals as R-E rows grouped by day,
// Undo all (secondary) and Keep the changes (primary) for the signed-in User's own edit, and the one circular Close (R-B).
import { useId, type ReactNode } from 'react'
import { BottomSheet, Button, Chip, DetailList, DetailRow } from '../../../ui'
import type { ReplanReviewController } from '../hooks/useReplanReview'
import { useSheetTitleFocus } from '../hooks/useSheetTitleFocus'
import type { ReviewDay } from '../lib/replan'
import { undoStrings as u } from '../strings/undo'
import './ReplanReviewSheet.css'

export interface ReplanReviewSheetProps {
  controller: ReplanReviewController
}

function Day({ day }: { day: ReviewDay }) {
  const id = useId()
  return (
    <section className="replan-review__day">
      <h3 id={id} className="replan-review__heading">
        {day.heading}
      </h3>
      <DetailList aria-labelledby={id} fill="surface">
        {day.rows.map((row) => (
          <DetailRow
            key={`${row.cell.mealSlotId}/${row.cell.courseId}`}
            label={row.key}
            detail={
              <span className="replan-review__detail">
                <span>{row.detail}</span>
                {row.why ? <Chip kind="why">{row.why}</Chip> : null}
              </span>
            }
          />
        ))}
      </DetailList>
    </section>
  )
}

export function ReplanReviewSheet({ controller }: ReplanReviewSheetProps): ReactNode {
  const { open, model, canUndo, busy } = controller
  // Review focuses its title (PC-01), never Undo all.
  const { bodyRef, titleRef } = useSheetTitleFocus<HTMLDivElement>()
  if (!open || !model) return null
  return (
    <BottomSheet
      open
      onClose={controller.keep}
      title={model.title}
      context={model.context}
      initialFocusRef={titleRef}
      footer={
        canUndo ? (
          <div className="replan-review__actions">
            <Button variant="secondary" icon="undo" loading={busy} onClick={() => void controller.undoAll()}>
              {u.undoAll}
            </Button>
            <Button variant="primary" onClick={controller.keep}>
              {u.keepChanges}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div ref={bodyRef} className="replan-review">
        <p className="replan-review__lede">{model.lede}</p>
        {model.days.map((day) => (
          <Day key={day.date} day={day} />
        ))}
      </div>
    </BottomSheet>
  )
}

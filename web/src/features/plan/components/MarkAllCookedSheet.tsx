import type { ReactNode } from 'react'
import { BottomSheet, Button, Chip, NumberField } from '../../../ui'
import { LEFTOVER_STEP } from '../lib/cook'
import type { AllCookedRow } from '../lib/toConfirm'
import { weekdayName } from '../lib/phrase'
import { planStrings as s } from '../strings'
import '../plan.css'

export interface MarkAllCookedSheetProps {
  open: boolean
  onClose: () => void
  rows: AllCookedRow[]
  isLoading: boolean
  onLeftoverChange: (courseId: number, portions: number) => void
  onConfirm: () => void
  busy: boolean
  error: string | null
}

/**
 * "Mark all Cooked": a block per Course (its name and Recipe). A fresh Course has its own Leftover field at its proposal
 * and the Use-by chip; a Leftover Course says nothing is taken from Stock. The footer holds the one primary button.
 */
export function MarkAllCookedSheet({ open, onClose, rows, isLoading, onLeftoverChange, onConfirm, busy, error }: MarkAllCookedSheetProps): ReactNode {
  const ready = rows.length > 0 && !isLoading
  const footer = (
    <div className="plan-sheet__actions">
      <Button variant="primary" disabled={busy || !ready} onClick={onConfirm}>
        {s.markAllCooked}
      </Button>
    </div>
  )
  return (
    <BottomSheet open={open} onClose={onClose} title={s.markAllCooked} footer={footer}>
      <div className="plan__stack">
        {isLoading || rows.length === 0 ? <p className="plan__muted">{s.loading}</p> : null}
        {rows.map((row) => (
          <section key={row.courseId} className="plan-sheet__course">
            <p className="plan__muted">{row.courseName}</p>
            <p className="plan-sheet__recipe">{row.recipeName}</p>
            {row.fresh ? (
              <>
                <NumberField
                  label={s.courseLeftoverLabel(row.courseName)}
                  value={row.leftover}
                  onChange={(v) => onLeftoverChange(row.courseId, v ?? 0)}
                  min={0}
                  max={row.maxLeftover}
                  step={LEFTOVER_STEP}
                />
                {row.leftover > 0 ? (
                  <Chip kind="status" status="leftover">
                    {s.leftoverUseBy(weekdayName(row.leftoverUseBy, 'short'))}
                  </Chip>
                ) : (
                  <Chip>{s.noLeftover}</Chip>
                )}
              </>
            ) : (
              <p className="plan__muted">{s.fromLeftoverNote}</p>
            )}
          </section>
        ))}
        {error ? (
          <p role="alert" className="plan__error">
            {error}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  )
}

import { useState, type ReactNode } from 'react'
import { Button, Dialog, TimeField } from '../../../ui'
import { canSaveTime, timeDialogCopy } from '../lib/slotDate'
import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'

export interface SlotTimeDialogProps {
  /** The slot being changed; null = closed. */
  slot: PlanSlot | null
  busy?: boolean
  onSave: (time: string) => void
  /** "Back to 19:30": the usual time again. Shown only when the date has its own time. */
  onBack: () => void
  onClose: () => void
}

/** "Time for Thu Dinner": the shared Dialog with the shared TimeField (caption "Time", helper "Usually 19:30"), Save, Back to the usual time, Cancel. */
export function SlotTimeDialog({ slot, busy = false, onSave, onBack, onClose }: SlotTimeDialogProps): ReactNode {
  if (!slot) return null
  // Keyed by the slot, so each opening starts from the slot's own time.
  return <TimeDialogBody key={`${slot.date}/${slot.mealSlotId}`} slot={slot} busy={busy} onSave={onSave} onBack={onBack} onClose={onClose} />
}

function TimeDialogBody({ slot, busy, onSave, onBack, onClose }: Required<Omit<SlotTimeDialogProps, 'slot'>> & { slot: PlanSlot }): ReactNode {
  const [draft, setDraft] = useState(slot.time)
  const copy = timeDialogCopy(slot)
  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      actions={
        <>
          {copy.back ? (
            <Button variant="tertiary" disabled={busy} onClick={onBack}>
              {copy.back}
            </Button>
          ) : null}
          <Button variant="tertiary" disabled={busy} onClick={onClose}>
            {s.slotDate.timeCancel}
          </Button>
          <Button variant="primary" disabled={busy || !canSaveTime(slot, draft)} loading={busy} onClick={() => onSave(draft)}>
            {s.slotDate.timeSave}
          </Button>
        </>
      }
    >
      <TimeField size="sm" label={copy.label} helper={copy.helper} value={draft} onChange={setDraft} />
    </Dialog>
  )
}

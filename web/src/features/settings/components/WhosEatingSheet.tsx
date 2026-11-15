import type { ReactNode } from 'react'
import { useAttendanceSheet, type AttendanceSheetOptions, type WhosEatingTarget } from '../hooks/useAttendanceSheet'
import { DateAttendancePanel } from './DateAttendancePanel'

export interface WhosEatingSheetProps extends Omit<AttendanceSheetOptions, 'onClose'> {
  /** The slot and date to edit; null = closed. */
  target: WhosEatingTarget | null
  onClose: () => void
  /** B9-46 (PC-08): "Add an Away" in the sheet's body; the screen swaps this sheet for the Away sheet from the same Meal Slot. */
  onAddAway?: () => void
}

/**
 * "Who's eating" for one Meal Slot on one date, opened from Plan and Today: the Date Attendance sheet (Members, Courses, Guests) with a
 * read-only date, fed by hooks/useAttendanceSheet. Settings > Meal Slots keeps its own entry to the same DateAttendancePanel.
 */
export function WhosEatingSheet({ target, onClose, beforeEmptying, onEmptied, onAddAway }: WhosEatingSheetProps): ReactNode {
  const sheet = useAttendanceSheet(target, { onClose, beforeEmptying, onEmptied })
  if (!target || !sheet.ready || !sheet.slot) return null
  return (
    <DateAttendancePanel
      open
      slot={sheet.slot}
      date={target.date}
      attendance={sheet.attendance}
      members={sheet.members}
      saving={sheet.saving}
      dateReadOnly
      onChangeDate={() => {}}
      onSave={async (attendance, courses, guests) => {
        await sheet.save(attendance, courses, guests)
      }}
      onReset={() => void sheet.reset()}
      onClose={onClose}
      onAddAway={onAddAway}
    />
  )
}

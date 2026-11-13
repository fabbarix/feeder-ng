import type { ReactNode } from 'react'
import { WhosEatingSheet } from '../../settings'
import type { SlotDateController } from '../hooks/useSlotDate'
import { SlotTimeDialog } from './SlotTimeDialog'

/** The overlays of the per-date choices: the Time dialog and the Who's eating sheet (Settings' Date Attendance sheet). One per screen. */
export function SlotDateSheets({ controller }: { controller: SlotDateController }): ReactNode {
  const { timeSlot, closeTime, saveTime, backToUsual, busy, whosEating } = controller
  return (
    <>
      <SlotTimeDialog slot={timeSlot} busy={busy} onSave={(time) => void saveTime(time)} onBack={() => void backToUsual()} onClose={closeTime} />
      <WhosEatingSheet target={whosEating.target} onClose={whosEating.close} beforeEmptying={whosEating.beforeEmptying} onEmptied={whosEating.onEmptied} />
    </>
  )
}

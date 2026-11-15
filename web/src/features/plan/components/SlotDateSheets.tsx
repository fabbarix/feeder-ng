import type { ReactNode } from 'react'
import { WhosEatingSheet } from '../../settings'
import type { SlotDateController } from '../hooks/useSlotDate'
import { AwaySheet } from './AwaySheet'
import { SlotTimeDialog } from './SlotTimeDialog'

/** The overlays of the per-date choices: the Time dialog and the Who's eating sheet (Settings' Date Attendance sheet). One per screen. */
export function SlotDateSheets({ controller }: { controller: SlotDateController }): ReactNode {
  const { timeSlot, closeTime, saveTime, backToUsual, busy, whosEating, away } = controller
  const awayTarget = away?.target ?? null
  return (
    <>
      <SlotTimeDialog slot={timeSlot} busy={busy} onSave={(time) => void saveTime(time)} onBack={() => void backToUsual()} onClose={closeTime} />
      <WhosEatingSheet target={whosEating.target} onClose={whosEating.close} beforeEmptying={whosEating.beforeEmptying} onEmptied={whosEating.onEmptied} onAddAway={away?.fromWhosEating} />
      {/* B9-46 (PC-08): the Away sheet, on the Plan (useSlotDate's `away`). */}
      {away ? (
        <AwaySheet
          key={awayTarget ? ('away' in awayTarget ? `away-${awayTarget.away.id}` : `from-${awayTarget.from.date}-${awayTarget.from.mealSlotId}`) : 'closed'}
          open={awayTarget !== null}
          from={awayTarget && 'from' in awayTarget ? awayTarget.from : undefined}
          away={awayTarget && 'away' in awayTarget ? awayTarget.away : undefined}
          onClose={away.close}
        />
      ) : null}
    </>
  )
}

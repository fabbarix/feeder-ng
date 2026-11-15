// B9-40 (PC-03): the sheet a tap on a timer pill (or a rail tile's ⋮) opens.
import type { ReactNode } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { formatTimer } from '../../../lib/format'
import type { TimerItem } from '../hooks/useTimers'
import { parseTimerLabel } from '../lib/householdTimers'
import { railPlace } from '../lib/timers'
import { cookStrings } from '../strings'

export interface CookTimerSheetProps {
  /** The timer to show; null keeps the sheet closed. */
  item: TimerItem | null
  /** The scope Cook Mode is open for (words the place line of another scope's timer). */
  scope: string
  holdsNext?: boolean
  onClose: () => void
  onAddMinute: (id: number) => void
  onCancel: (id: number) => void
  onDismiss: (id: number) => void
}

/**
 * A BottomSheet named after the timer, with the one round Close (R-B): its time left and place line, then "Add 1 minute" (secondary)
 * and "Cancel timer" (danger secondary) for a running or paused timer, "Dismiss" alone for a finished one. Each action closes the
 * sheet; the Undo toast of a cancel is the screen's (hooks/useTimerActions).
 */
export function CookTimerSheet({ item, scope, holdsNext = false, onClose, onAddMinute, onCancel, onDismiss }: CookTimerSheetProps): ReactNode {
  if (!item) return null
  const { id, state, label } = item.timer
  const finished = state === 'finished' || item.seconds <= 0
  const place = railPlace(item.timer, scope, holdsNext)
  const act = (fn: (id: number) => void) => () => {
    fn(id)
    onClose()
  }
  return (
    <BottomSheet open onClose={onClose} title={parseTimerLabel(label).title}>
      <div className="cook-timer-sheet" data-state={finished ? 'finished' : state}>
        <p className="cook-timer-sheet__time">{finished ? cookStrings.timerDone : formatTimer(item.seconds)}</p>
        {place ? <p className="cook-timer-sheet__place">{place}</p> : null}
        <div className="cook-timer-sheet__actions">
          {finished ? (
            <Button variant="secondary" size="lg" icon="remove" onClick={act(onDismiss)}>
              {cookStrings.dismissTimer}
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="lg" icon="addMinute" onClick={act(onAddMinute)}>
                {cookStrings.addMinute}
              </Button>
              <Button variant="danger-secondary" size="lg" icon="remove" onClick={act(onCancel)}>
                {cookStrings.cancelTimer}
              </Button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

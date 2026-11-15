// B9-40 (SHORT-01): the sheet the landscape strip's "+N" opens: every timer, each row opening that timer's own sheet.
import type { ReactNode } from 'react'
import { BottomSheet, ListGroup, ListRow } from '../../../ui'
import { formatTimer } from '../../../lib/format'
import type { TimerItem } from '../hooks/useTimers'
import { cookTimerOrder, railPlace, timerNames } from '../lib/timers'
import { cookStrings } from '../strings'

export interface CookTimersSheetProps {
  open: boolean
  scope: string
  items: TimerItem[]
  holdingIds?: number[]
  belongs?: (timerScope: string | null) => boolean
  onClose: () => void
  /** A row's tap: the screen closes this sheet and opens the timer's own (components/CookTimerSheet). */
  onOpenTimer: (id: number) => void
}

/** A BottomSheet "Timers" with the one round Close: one ListRow per timer (its name, place line and time), in Cook Mode's order. */
export function CookTimersSheet({ open, scope, items, holdingIds = [], belongs, onClose, onOpenTimer }: CookTimersSheetProps): ReactNode {
  const names = timerNames(items.map((i) => i.timer))
  return (
    <BottomSheet open={open} onClose={onClose} title={cookStrings.timersRegion}>
      <ListGroup label={cookStrings.timersRegion}>
        {cookTimerOrder(items, scope, holdingIds, belongs).map((item) => {
          const { id, state, label } = item.timer
          const finished = state === 'finished' || item.seconds <= 0
          return (
            <ListRow
              key={id}
              title={names.get(id) ?? label}
              meta={railPlace(item.timer, scope, holdingIds.includes(id)) || undefined}
              icon={finished ? 'bellRinging' : state === 'paused' ? 'pause' : 'timer'}
              value={finished ? cookStrings.timerDone : formatTimer(item.seconds)}
              chevron
              haspopup="dialog"
              data-state={finished ? 'finished' : state}
              onActivate={() => onOpenTimer(id)}
            />
          )
        })}
      </ListGroup>
    </BottomSheet>
  )
}

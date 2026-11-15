import { timerContext, type ShellTimer } from '../features/cook/lib/householdTimers'
import { formatTimer } from '../lib/format'
import { BottomSheet, ListGroup, ListRow } from '../ui'
import { shellTimerStrings as s } from './shellTimerStrings'

export interface TimersSheetProps {
  open: boolean
  timers: ShellTimer[]
  onClose: () => void
  onOpenTimer: (timer: ShellTimer) => void
}

function TimeValue({ timer }: { timer: ShellTimer }) {
  if (timer.state === 'finished') return <span className="shell-timer-row__time">{s.finished}</span>
  return (
    <span className="shell-timer-row__time" data-state={timer.state}>
      {formatTimer(timer.seconds)}
      {timer.state === 'paused' ? <span className="shell-timer-row__paused"> {s.paused}</span> : null}
    </span>
  )
}

/** The household's timers when there is no single Cook Mode to open (several scopes, or a free timer). A Close-button sheet. */
export function TimersSheet({ open, timers, onClose, onOpenTimer }: TimersSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={s.sheetTitle}>
      <ListGroup label={s.listLabel}>
        {timers.map((timer) => {
          const meta = timerContext(timer) || undefined
          const icon = timer.state === 'finished' ? 'bellRinging' : timer.state === 'paused' ? 'pause' : 'timer'
          return timer.scope ? (
            <ListRow
              key={timer.id}
              title={timer.title}
              aria-label={s.openRow(timer.title)}
              meta={meta}
              icon={icon}
              value={<TimeValue timer={timer} />}
              chevron
              data-state={timer.state}
              onActivate={() => onOpenTimer(timer)}
            />
          ) : (
            <ListRow key={timer.id} title={timer.title} meta={meta} icon={icon} value={<TimeValue timer={timer} />} data-state={timer.state} />
          )
        })}
      </ListGroup>
    </BottomSheet>
  )
}

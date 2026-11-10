import { formatTimer } from '../lib/format'
import { IconButton } from './IconButton'
import { Tile } from './Tile'
import './TimerTile.css'

export interface TimerTileProps {
  label: string
  seconds: number
  running?: boolean
  /** Length the timer started with; when given a progress bar (aria-hidden) shows the elapsed share. */
  totalSeconds?: number
  /** Controls, each an IconButton, rendered only when its handler is given: pause/resume, +1 min, dismiss. */
  onToggle?: () => void
  onAddMinute?: () => void
  onDismiss?: () => void
  /** @deprecated use the controls above; kept for unmigrated screens (a clickable tile, role button). */
  onClick?: () => void
}

/** running; paused; finished = exactly 0 (success, Bell); overdue = below 0, counts up shown as "+m:ss" (spoil). */
export type TimerState = 'running' | 'paused' | 'finished' | 'overdue'

function stateOf(seconds: number, running: boolean): TimerState {
  if (seconds < 0) return 'overdue'
  if (seconds === 0) return 'finished'
  return running ? 'running' : 'paused'
}

/** A cook timer, announced as a timer (docs/design/ui-fix-plan.md 4.12). */
export function TimerTile({ label, seconds, running = false, totalSeconds, onToggle, onAddMinute, onDismiss, onClick }: TimerTileProps) {
  const state = stateOf(seconds, running)
  const variant = state === 'running' ? 'soft' : state === 'paused' ? 'surface' : 'status'
  const status = state === 'finished' ? 'success' : state === 'overdue' ? 'spoil' : undefined
  const display = seconds < 0 ? `+${formatTimer(-seconds)}` : formatTimer(seconds)
  const share = totalSeconds && totalSeconds > 0 ? Math.min(Math.max((totalSeconds - seconds) / totalSeconds, 0), 1) : 0
  const hasControls = Boolean(onToggle || onAddMinute || onDismiss)
  const overlineIcon = state === 'paused' ? 'pause' : state === 'finished' ? 'notifications' : undefined

  return (
    <Tile
      variant={variant}
      status={status}
      className="timer-tile"
      role="timer"
      aria-label={label}
      data-state={state}
      overline={label}
      overlineIcon={overlineIcon}
      onClick={onClick}
    >
      <span className="timer-tile__time">{display}</span>
      {totalSeconds ? (
        <span className="timer-tile__bar" aria-hidden="true">
          <span className="timer-tile__fill" style={{ width: `${share * 100}%` }} />
        </span>
      ) : null}
      {hasControls ? (
        <div className="timer-tile__controls">
          {onToggle ? (
            <IconButton size="compact" icon={running ? 'pause' : 'resume'} label={running ? 'Pause' : 'Resume'} onClick={onToggle} />
          ) : null}
          {onAddMinute ? <IconButton size="compact" icon="addMinute" label="Add a minute" onClick={onAddMinute} /> : null}
          {onDismiss ? <IconButton size="compact" icon="close" label="Dismiss timer" onClick={onDismiss} /> : null}
        </div>
      ) : null}
    </Tile>
  )
}

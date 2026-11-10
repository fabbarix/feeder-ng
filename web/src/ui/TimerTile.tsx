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
  /** Controls, each an IconButton named after the timer (e.g. "Pause Rice"), rendered only when its handler is given. */
  onToggle?: () => void
  onAddMinute?: () => void
  onDismiss?: () => void
  /** WP3b: a separate "Cancel <label>" control (stop a timer still going); Dismiss clears a finished one. */
  onCancel?: () => void
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
export function TimerTile({ label, seconds, running = false, totalSeconds, onToggle, onAddMinute, onDismiss, onCancel, onClick }: TimerTileProps) {
  const state = stateOf(seconds, running)
  const variant = state === 'running' ? 'soft' : state === 'paused' ? 'surface' : 'status'
  const status = state === 'finished' ? 'success' : state === 'overdue' ? 'spoil' : undefined
  const display = seconds < 0 ? `+${formatTimer(-seconds)}` : formatTimer(seconds)
  const share = totalSeconds && totalSeconds > 0 ? Math.min(Math.max((totalSeconds - seconds) / totalSeconds, 0), 1) : 0
  const hasControls = Boolean(onToggle || onAddMinute || onDismiss || onCancel)
  const overlineIcon = state === 'paused' ? 'pause' : state === 'finished' ? 'notifications' : undefined

  return (
    <Tile
      variant={variant}
      status={status}
      className="timer-tile"
      role={onClick ? undefined : 'timer'}
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
            <IconButton
              size="compact"
              icon={running ? 'pause' : 'resume'}
              label={`${running ? 'Pause' : 'Resume'} ${label}`}
              onClick={onToggle}
            />
          ) : null}
          {onAddMinute ? <IconButton size="compact" icon="addMinute" label={`Add a minute to ${label}`} onClick={onAddMinute} /> : null}
          {onCancel ? <IconButton size="compact" icon="close" label={`Cancel ${label}`} onClick={onCancel} /> : null}
          {onDismiss ? <IconButton size="compact" icon="close" label={`Dismiss ${label}`} onClick={onDismiss} /> : null}
        </div>
      ) : null}
    </Tile>
  )
}

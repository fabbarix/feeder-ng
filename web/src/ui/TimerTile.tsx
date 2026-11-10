import { formatTimer } from '../lib/format'
import { Tile } from './Tile'

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
  /** @deprecated use `stretched`-less TimerTile with controls; kept for unmigrated screens. */
  onClick?: () => void
}

/** running; paused; finished = exactly 0 (success, Bell); overdue = below 0, counts up shown as "+m:ss" (spoil). */
export type TimerState = 'running' | 'paused' | 'finished' | 'overdue'

/** STUB (WP3 designer, old behaviour retained until the Developer lands the spec). A `soft` Tile counting a cook timer, announced as a timer. */
export function TimerTile({ label, seconds, running = false, onClick }: TimerTileProps) {
  const state: TimerState = seconds < 0 ? 'overdue' : seconds === 0 ? 'finished' : running ? 'running' : 'paused'
  return (
    <Tile
      size="sm"
      tone={state === 'finished' || state === 'overdue' ? 'spoil' : 'neutral'}
      className="timer-tile"
      role="timer"
      aria-label={label}
      data-state={state}
      onClick={onClick}
    >
      <span className="timer-tile__time">{formatTimer(seconds)}</span>
      <p className="timer-tile__label">{label}</p>
    </Tile>
  )
}

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
  /** B9-17 (PC-03): `md` is the Cook Mode rail tile (a 2-line label, a place line, 44 px circular controls, a focus scope). Default: the compact tile. */
  size?: 'md'
  /** B9-17: `compact` drops the progress bar and tightens the tile (the board's grid). */
  density?: 'compact'
  /** B9-17: the place line of an md tile ("Step 1 · Roast chicken"). */
  place?: string
  /** B9-17: md only, the "Options for <label>" button. */
  onMore?: () => void
  /** @deprecated use the controls above; kept for unmigrated screens (a clickable tile, role button). */
  onClick?: () => void
}

/** running; paused; finished = exactly 0 (success, Bell); overdue = below 0, counts up shown as "+m:ss" (info: lateness is never red,
 * peach or mustard, DS-06 and decision DS 3). */
export type TimerState = 'running' | 'paused' | 'finished' | 'overdue'

function stateOf(seconds: number, running: boolean): TimerState {
  if (seconds < 0) return 'overdue'
  if (seconds === 0) return 'finished'
  return running ? 'running' : 'paused'
}

/**
 * A cook timer, announced as a timer (docs/design/ui-fix-plan.md 4.12). The default tile is the compact strip and board tile;
 * `size="md"` is Cook Mode's rail tile (PC-03): a two-line label, a place line and 44 px circular controls, and the tile is a focus
 * scope, so a focused control rings inside itself (R-C+).
 */
export function TimerTile({ label, seconds, running = false, totalSeconds, size, density, place, onMore, onToggle, onAddMinute, onDismiss, onCancel, onClick }: TimerTileProps) {
  const md = size === 'md'
  const compact = density === 'compact'
  const state = stateOf(seconds, running)
  const variant = state === 'running' ? 'soft' : state === 'paused' ? 'surface' : 'status'
  const status = state === 'finished' ? 'success' : state === 'overdue' ? 'info' : undefined
  const display = seconds < 0 ? `+${formatTimer(-seconds)}` : formatTimer(seconds)
  const share = totalSeconds && totalSeconds > 0 ? Math.min(Math.max((totalSeconds - seconds) / totalSeconds, 0), 1) : 0
  const more = md ? onMore : undefined
  const hasControls = Boolean(onToggle || onAddMinute || onDismiss || onCancel || more)
  const overlineIcon = state === 'paused' ? 'pause' : state === 'finished' ? 'notifications' : undefined
  const ctl = md ? ({ size: 'md', shape: 'circle' } as const) : ({ size: 'compact' } as const)

  return (
    <Tile
      variant={variant}
      status={status}
      className="timer-tile"
      role={onClick ? undefined : 'timer'}
      aria-label={label}
      data-state={state}
      data-size={md ? 'md' : undefined}
      data-density={compact ? 'compact' : undefined}
      data-focus-scope={md ? '' : undefined}
      overline={md ? undefined : <span className="timer-tile__label">{label}</span>}
      overlineIcon={md ? undefined : overlineIcon}
      onClick={onClick}
    >
      {md ? <p className="timer-tile__label">{label}</p> : null}
      {md && place ? <p className="timer-tile__place">{place}</p> : null}
      <span className="timer-tile__time">{display}</span>
      {totalSeconds && !compact ? (
        <span className="timer-tile__bar" aria-hidden="true">
          <span className="timer-tile__fill" style={{ width: `${share * 100}%` }} />
        </span>
      ) : null}
      {hasControls ? (
        <div className="timer-tile__controls">
          {onToggle ? <IconButton {...ctl} icon={running ? 'pause' : 'resume'} label={`${running ? 'Pause' : 'Resume'} ${label}`} onClick={onToggle} /> : null}
          {onAddMinute ? <IconButton {...ctl} icon="addMinute" label={`Add a minute to ${label}`} onClick={onAddMinute} /> : null}
          {onCancel ? <IconButton {...ctl} icon="remove" label={`Cancel ${label}`} onClick={onCancel} /> : null}
          {onDismiss ? <IconButton {...ctl} icon="remove" label={`Dismiss ${label}`} onClick={onDismiss} /> : null}
          {more ? <IconButton {...ctl} icon="more" label={`Options for ${label}`} onClick={more} /> : null}
        </div>
      ) : null}
    </Tile>
  )
}

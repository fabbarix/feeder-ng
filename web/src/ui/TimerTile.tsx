import { formatTimer } from '../lib/format'
import { Tile } from './Tile'

export interface TimerTileProps {
  label: string
  seconds: number
  running?: boolean
  onClick?: () => void
}

export type TimerState = 'running' | 'paused' | 'expired'

/** A Tile counting down a cook timer, announced as a timer. */
export function TimerTile({ label, seconds, running = false, onClick }: TimerTileProps) {
  const state: TimerState = seconds <= 0 ? 'expired' : running ? 'running' : 'paused'
  return (
    <Tile
      size="sm"
      tone={state === 'expired' ? 'spoil' : 'neutral'}
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

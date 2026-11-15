import { formatTimer } from '../lib/format'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import type { IconName } from './icons'
import { timerPillStrings as s } from './TimerPill.strings'
import './TimerPill.css'

export interface TimerPillProps {
  /** The timer's label, sentence case ("Roast the chicken"). It names the timer region. */
  label: string
  /** Seconds left; 0 or below is finished. */
  seconds: number
  /** Default true; false shows the paused state. */
  running?: boolean
  /** The seconds the accessible name says (default `seconds`): the shell refreshes the name once a minute while the time ticks. */
  nameSeconds?: number
  /** How many other timers exist: a "+N" badge (aria-hidden; the count is in the name). */
  more?: number
  /** The timer that holds Next in Cook Mode: a 2 px accent boundary, which steps back while a control inside has focus. */
  gate?: boolean
  /** Opens Cook Mode at the timer's Step. */
  onOpen: () => void
  /** Cook Mode's strip: a round Pause / Resume beside the open button. The shell's pill has none. */
  onToggle?: () => void
}

type PillState = 'running' | 'paused' | 'finished'

/**
 * One timer as a pill (PC-03, PC-04): an open button (icon, label, time, "+N") and an optional round Pause. The pill is a focus
 * scope with its own boundary and 4 px of fill around its controls, so a focused control rings inside itself (R-C+). It positions
 * nothing: the shell and Cook Mode place it.
 */
export function TimerPill({ label, seconds, running = true, nameSeconds, more = 0, gate, onOpen, onToggle }: TimerPillProps) {
  const state: PillState = seconds <= 0 ? 'finished' : running ? 'running' : 'paused'
  const others = Math.max(0, Math.trunc(more))
  const icon: IconName = state === 'finished' ? 'bellRinging' : state === 'paused' ? 'pause' : 'timer'
  const name = state === 'finished' ? s.openFinished(label, others) : s.open(label, formatTimer(nameSeconds ?? seconds), others)

  return (
    <div className="timer-pill" role="timer" aria-label={label} data-focus-scope="" data-state={state} data-gate={gate ? '' : undefined}>
      <button type="button" className="timer-pill__open" aria-label={name} onClick={onOpen}>
        <Icon name={icon} size={20} />
        <span className="timer-pill__label">{label}</span>
        <span className="timer-pill__time">{state === 'finished' ? s.finished : formatTimer(seconds)}</span>
        {others > 0 ? (
          <span className="timer-pill__more" aria-hidden="true">
            +{others}
          </span>
        ) : null}
      </button>
      {onToggle ? (
        <IconButton
          className="timer-pill__toggle"
          shape="circle"
          icon={running ? 'pause' : 'resume'}
          label={running ? s.pause(label) : s.resume(label)}
          onClick={onToggle}
        />
      ) : null}
    </div>
  )
}

import type { ReactNode } from 'react'
import type { TimerItem } from '../hooks/useTimers'
import { Button, TimerTile } from '../../../ui'
import { cookStrings } from '../strings'

export interface CookTimerStripProps {
  items: TimerItem[]
  onPause: (id: number) => void
  onResume: (id: number) => void
  onCancel: (id: number) => void
}

/**
 * The running timers as shared `TimerTile`s (role timer, named by the label).
 * Tapping a running tile pauses it, a paused one resumes it, a finished one
 * dismisses it (cancel). Every timer also has a button "Cancel timer <label>"
 * (finished ones "Dismiss <label>"). A finished timer shows "<label> is ready".
 * Renders nothing when there are no timers.
 */
export function CookTimerStrip({ items, onPause, onResume, onCancel }: CookTimerStripProps): ReactNode {
  if (items.length === 0) return null
  const tap = (item: TimerItem) => {
    const { id, state } = item.timer
    if (state === 'running') onPause(id)
    else if (state === 'paused') onResume(id)
    else onCancel(id)
  }
  return (
    <section className="cook-timers">
      <h2 className="cook-timers__heading">{cookStrings.timersHeading}</h2>
      <ul className="cook-timers__list">
        {items.map((item) => {
          const { label, id, state } = item.timer
          const finished = state === 'finished'
          return (
            <li key={id} className="cook-timers__item">
              <TimerTile label={label} seconds={item.seconds} running={state === 'running'} onClick={() => tap(item)} />
              {finished ? <p role="status">{cookStrings.timerFinished(label)}</p> : null}
              <Button variant="ghost" size="md" onClick={() => onCancel(id)}>
                {finished ? cookStrings.dismissTimer : cookStrings.cancelTimer} {label}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

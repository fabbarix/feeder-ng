import type { ReactNode } from 'react'
import type { TimerItem } from '../hooks/useTimers'
import { partitionByScope, timerActions, timerPlace } from '../lib/timers'
import { TimerTile } from '../../../ui'
import { cookStrings } from '../strings'

export interface CookTimerStripProps {
  /** The scope Cook Mode is open for: its timers come first under "Timers"; the rest under "Other timers". */
  scope: string
  items: TimerItem[]
  onPause: (id: number) => void
  onResume: (id: number) => void
  onCancel: (id: number) => void
  /**
   * The timeline shows EVERY timer of the slot's Courses under "Timers" whichever Course chip is chosen. When given, a
   * timer is "here" when `belongs(timer.scope)` is true (the screen builds it with sameScope over the slot's Courses);
   * `scope` then only words the place hint of the other timers.
   */
  belongs?: (timerScope: string | null) => boolean
}

/**
 * The household's timers as shared `TimerTile`s (role timer, named by the label), two to a row: this scope's under
 * "Timers", the others under "Other timers" with where they belong. Each tile carries its own controls: pause or
 * resume (lib/timers timerActions); a running or paused timer has "Cancel <label>" (stops it), a finished one
 * "Dismiss <label>" (clears it). Both end the timer through onCancel. Renders nothing when there are no timers.
 */
export function CookTimerStrip({ scope, items, onPause, onResume, onCancel, belongs }: CookTimerStripProps): ReactNode {
  if (items.length === 0) return null
  const { here, elsewhere } = belongs
    ? { here: items.filter((i) => belongs(i.timer.scope)), elsewhere: items.filter((i) => !belongs(i.timer.scope)) }
    : partitionByScope(items, scope)
  const handlers = { onPause, onResume, onCancel }
  return (
    <>
      {here.length > 0 ? <TimerGroup label={cookStrings.timersRegion} items={here} scope={scope} {...handlers} /> : null}
      {elsewhere.length > 0 ? (
        <TimerGroup label={cookStrings.otherTimersRegion} items={elsewhere} scope={scope} {...handlers} showPlace />
      ) : null}
    </>
  )
}

interface TimerGroupProps extends Omit<CookTimerStripProps, 'items'> {
  label: string
  items: TimerItem[]
  showPlace?: boolean
}

/** One region of timers: a list of tiles, each with its controls. */
function TimerGroup({ label, items, scope, showPlace, onPause, onResume, onCancel }: TimerGroupProps): ReactNode {
  return (
    <section className="cook-timers" aria-label={label}>
      <h2 className="cook-timers__heading">{label}</h2>
      <ul className="cook-timers__list">
        {items.map((item) => {
          const { label: name, id, state } = item.timer
          const actions = timerActions(state)
          const place = showPlace ? timerPlace(item.timer.scope, scope, item.timer.recipeName) : ''
          const onToggle = actions.includes('pause')
            ? () => onPause(id)
            : actions.includes('resume')
              ? () => onResume(id)
              : undefined
          const onCancelTimer = actions.includes('cancel') ? () => onCancel(id) : undefined
          const onDismissTimer = actions.includes('dismiss') ? () => onCancel(id) : undefined
          return (
            <li key={id} className="cook-timers__item">
              <TimerTile
                label={name}
                seconds={item.seconds}
                running={state === 'running'}
                onToggle={onToggle}
                onCancel={onCancelTimer}
                onDismiss={onDismissTimer}
              />
              {place ? <span className="cook-timers__place">{place}</span> : null}
              {state === 'finished' ? <p role="status">{cookStrings.timerFinished(name)}</p> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import type { ReactNode } from 'react'
import type { TimerItem } from '../hooks/useTimers'
import { partitionByScope, timerActions, timerPlace, type TimerAction } from '../lib/timers'
import { Button, TimerTile } from '../../../ui'
import { cookStrings } from '../strings'

export interface CookTimerStripProps {
  /** The scope Cook Mode is open for: its timers come first under "Timers"; the rest under "Other timers". */
  scope: string
  items: TimerItem[]
  onPause: (id: number) => void
  onResume: (id: number) => void
  onCancel: (id: number) => void
}

/**
 * The household's timers as shared `TimerTile`s (role timer, named by the label): this scope's under "Timers", the
 * others under "Other timers" with where they belong. The tile itself is not clickable; each timer has explicit buttons from lib/timers timerActions. Renders nothing when
 * there are no timers.
 */
export function CookTimerStrip({ scope, items, onPause, onResume, onCancel }: CookTimerStripProps): ReactNode {
  if (items.length === 0) return null
  const { here, elsewhere } = partitionByScope(items, scope)
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
  const run = (action: TimerAction, item: TimerItem) => {
    const { id, label: name } = item.timer
    switch (action) {
      case 'pause':
        return <Button key={action} variant="ghost" size="md" onClick={() => onPause(id)}>{cookStrings.timerPause(name)}</Button>
      case 'resume':
        return <Button key={action} variant="ghost" size="md" onClick={() => onResume(id)}>{cookStrings.timerResume(name)}</Button>
      case 'cancel':
        return <Button key={action} variant="ghost" size="md" onClick={() => onCancel(id)}>{cookStrings.timerCancel(name)}</Button>
      case 'dismiss':
        return <Button key={action} variant="ghost" size="md" onClick={() => onCancel(id)}>{cookStrings.timerDismiss(name)}</Button>
    }
  }
  return (
    <section className="cook-timers" aria-label={label}>
      <h2 className="cook-timers__heading">{label}</h2>
      <ul className="cook-timers__list">
        {items.map((item) => {
          const { label: name, id, state } = item.timer
          const place = showPlace ? timerPlace(item.timer.scope, scope) : ''
          return (
            <li key={id} className="cook-timers__item">
              <TimerTile label={name} seconds={item.seconds} running={state === 'running'} />
              {place ? <span className="cook-timers__place">{place}</span> : null}
              {state === 'finished' ? <p role="status">{cookStrings.timerFinished(name)}</p> : null}
              <div className="cook-timers__actions">{timerActions(state).map((a) => run(a, item))}</div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

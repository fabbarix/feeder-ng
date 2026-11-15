// B9-40 (PC-03, from 1024 px): the rail beside the Step: the timers as md TimerTiles, then Get ready (B9-45 passes it as children).
import type { ReactNode } from 'react'
import { TimerTile } from '../../../ui'
import type { TimerItem } from '../hooks/useTimers'
import { cookTimerOrder, railPlace, timerNames } from '../lib/timers'
import { cookStrings } from '../strings'

export interface CookTimerRailProps {
  scope: string
  items: TimerItem[]
  holdingIds?: number[]
  belongs?: (timerScope: string | null) => boolean
  onPause: (id: number) => void
  onResume: (id: number) => void
  /** The tile's "Options for <label>" button: opens the timer's sheet. */
  onOpenTimer: (id: number) => void
  /** Below the timers: Get ready (B9-45 mounts it). */
  children?: ReactNode
}

/**
 * An `aside` "Timers" ("Timers and Ingredients" with children): a "Timers" region with its heading and one md `TimerTile` per timer
 * (a 2-line label, the place line of lib/timers railPlace, the time, a 44 px circular Pause or Resume and ⋮ "Options for <label>"),
 * the timers that hold Next first. Nothing at all with no timers and no children.
 */
export function CookTimerRail({ scope, items, holdingIds = [], belongs, onPause, onResume, onOpenTimer, children }: CookTimerRailProps): ReactNode {
  const hasChildren = children !== undefined && children !== null && children !== false
  if (items.length === 0 && !hasChildren) return null
  const names = timerNames(items.map((i) => i.timer))
  const ordered = cookTimerOrder(items, scope, holdingIds, belongs)
  return (
    <aside className="cook-rail" aria-label={hasChildren ? cookStrings.timersAndIngredients : cookStrings.timersRegion}>
      {ordered.length > 0 ? (
        <section className="cook-rail__timers" aria-label={cookStrings.timersRegion}>
          <h2 className="cook-timers__heading">{cookStrings.timersRegion}</h2>
          {ordered.map((item) => {
            const { id, state, label } = item.timer
            const finished = state === 'finished' || item.seconds <= 0
            const holds = holdingIds.includes(id)
            return (
              <div key={id} className="cook-rail__timer" data-gate={holds ? '' : undefined}>
                <TimerTile
                  size="md"
                  label={names.get(id) ?? label}
                  place={railPlace(item.timer, scope, holds)}
                  seconds={finished ? 0 : item.seconds}
                  running={state === 'running'}
                  onToggle={finished ? undefined : state === 'running' ? () => onPause(id) : () => onResume(id)}
                  onMore={() => onOpenTimer(id)}
                />
              </div>
            )
          })}
        </section>
      ) : null}
      {children}
    </aside>
  )
}

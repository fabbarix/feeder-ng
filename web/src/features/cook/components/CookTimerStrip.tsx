import type { ReactNode } from 'react'
import { TimerPill } from '../../../ui/TimerPill'
import type { TimerItem } from '../hooks/useTimers'
import { parseTimerLabel } from '../lib/householdTimers'
import { cookTimerOrder, splitPills } from '../lib/timers'
import { cookStrings } from '../strings'

export interface CookTimerStripProps {
  /** The scope Cook Mode is open for: its timers come after the ones that hold Next, before the others. */
  scope: string
  items: TimerItem[]
  onPause: (id: number) => void
  onResume: (id: number) => void
  /** Kept for callers; a pill has no Cancel (stopping a timer is in its sheet, components/CookTimerSheet). */
  onCancel?: (id: number) => void
  /**
   * The timeline counts EVERY timer of the slot's Courses as here whichever Course chip is chosen: a timer is here when
   * `belongs(timer.scope)` is true (the screen builds it with sameScope over the slot's Courses).
   */
  belongs?: (timerScope: string | null) => boolean
  /** B9-40 (PC-03): the ids of the timers that hold Next: they come first and carry the accent boundary. */
  holdingIds?: number[]
  /** B9-40 (SHORT-01): short landscape shows only this many whole pills; the last one carries "+N". */
  maxPills?: number
  /** B9-40 (PC-03): a tap on a pill opens that timer's sheet. */
  onOpenTimer?: (id: number) => void
  /** B9-40 (SHORT-01): the "+N" button opens every timer. */
  onShowAll?: () => void
}

/**
 * Cook Mode's timers below 64 em (PC-03): one region "Timers" of `TimerPill`s in a line, sticky inside `.cook-nav`. Order: the
 * timers that hold Next (the accent boundary), this scope's, then the others (lib/timers cookTimerOrder). A pill's one control is
 * Pause or Resume; a tap opens the timer's sheet. With `maxPills` only whole pills show and the last carries "+N" (SHORT-01).
 * Renders nothing when there are no timers.
 */
export function CookTimerStrip({ scope, items, onPause, onResume, belongs, holdingIds = [], maxPills, onOpenTimer, onShowAll }: CookTimerStripProps): ReactNode {
  if (items.length === 0) return null
  const { shown, more } = splitPills(cookTimerOrder(items, scope, holdingIds, belongs), maxPills)
  return (
    <section className="cook-strip" aria-label={cookStrings.timersRegion}>
      {shown.map((item, i) => {
        const { id, state, label } = item.timer
        const finished = state === 'finished' || item.seconds <= 0
        const last = i === shown.length - 1
        return (
          <TimerPill
            key={id}
            label={parseTimerLabel(label).title}
            seconds={finished ? 0 : item.seconds}
            running={state === 'running'}
            gate={holdingIds.includes(id)}
            more={last ? more : 0}
            onShowAll={last && more > 0 ? onShowAll : undefined}
            onOpen={() => onOpenTimer?.(id)}
            onToggle={finished ? undefined : state === 'running' ? () => onPause(id) : () => onResume(id)}
          />
        )
      })}
    </section>
  )
}

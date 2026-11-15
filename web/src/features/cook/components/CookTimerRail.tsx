// B9-40 stub (PC-03, from 1024 px): the rail of timer tiles beside the Step. The developer implements it.
import type { ReactNode } from 'react'
import type { TimerItem } from '../hooks/useTimers'

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

export function CookTimerRail(_props: CookTimerRailProps): ReactNode {
  return null
}

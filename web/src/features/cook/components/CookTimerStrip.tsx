import type { ReactNode } from 'react'
import type { TimerItem } from '../hooks/useTimers'

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
export function CookTimerStrip(_props: CookTimerStripProps): ReactNode {
  return null
}

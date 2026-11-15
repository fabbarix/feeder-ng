// B9-40 stub (PC-03): what Cook Mode does with a timer from its pill, its rail tile and its sheet. The developer implements it.
import type { TimerItem, UseTimers } from './useTimers'

export interface TimerActions {
  pause: (id: number) => Promise<void>
  resume: (id: number) => Promise<void>
  /** "Add 1 minute": the server cannot extend a timer, so the timer is cancelled and started again with a minute more. */
  addMinute: (id: number) => Promise<void>
  /** "Cancel timer": cancels it and shows the Undo toast "Timer cancelled" with the timer's short name; Undo starts it again with what was left. */
  cancel: (id: number) => Promise<void>
  /** A finished timer's "Dismiss": clears it, no toast. */
  dismiss: (id: number) => Promise<void>
}

export type TimerActionsSource = Pick<UseTimers, 'start' | 'pause' | 'resume' | 'cancel'> & { items: TimerItem[] }

export function useTimerActions(_timers: TimerActionsSource): TimerActions {
  const none = async () => {}
  return { pause: none, resume: none, addMinute: none, cancel: none, dismiss: none }
}

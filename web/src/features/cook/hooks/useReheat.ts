import { useState } from 'react'
import type { SlotKey } from '../../plan/types'
import { adjustReheatSeconds, defaultReheatSeconds, REHEAT_LABEL, reheatTimerOf } from '../lib/reheat'
import { scopeOf } from '../lib/scope'
import type { CookTimer } from '../types'
import { useTimers } from './useTimers'

export interface UseReheat {
  /** The chosen reheating time before the timer starts (seconds). */
  durationSeconds: number
  /** Moves the chosen time by delta seconds (lib/reheat adjustReheatSeconds); ignored once a timer exists. */
  adjust: (deltaSeconds: number) => void
  /** This Planned Meal's reheating timer (any state), else null. */
  timer: CookTimer | null
  /** Whole seconds left on the timer (0 when there is none or it has finished). */
  secondsLeft: number
  /** Starts the timer (label "Reheat", scope meal:<date>/<slot>); does nothing when one already exists. */
  start: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** Cancels the timer (it is deleted). */
  cancel: () => Promise<void>
}

/** Reheat's timer state for one Planned Meal (R12). Composes useTimers() and lib/reheat; renders nothing. */
export function useReheat(key: SlotKey, portions: number, reheatMinutes?: number | null): UseReheat {
  const timers = useTimers()
  const scope = scopeOf({ kind: 'meal', date: key.date, mealSlotId: key.mealSlotId })
  const [chosen, setChosen] = useState(() => defaultReheatSeconds(portions, reheatMinutes))
  const timer = reheatTimerOf(timers.timers, scope)
  const secondsLeft = timer ? (timers.items.find((i) => i.timer.id === timer.id)?.seconds ?? 0) : 0

  return {
    durationSeconds: chosen,
    adjust: (delta) => {
      if (!timer) setChosen((c) => adjustReheatSeconds(c, delta))
    },
    timer,
    secondsLeft,
    start: async () => {
      if (timer) return
      await timers.start({ scope, label: REHEAT_LABEL, durationSeconds: chosen })
    },
    pause: async () => {
      if (timer) await timers.pause(timer.id)
    },
    resume: async () => {
      if (timer) await timers.resume(timer.id)
    },
    cancel: async () => {
      if (timer) await timers.cancel(timer.id)
    },
  }
}

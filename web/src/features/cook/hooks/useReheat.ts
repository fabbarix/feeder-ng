import { useRef, useState } from 'react'
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
  /** True while a start is in flight (POST + refetch): a second tap is ignored and the button shows busy. */
  starting: boolean
  /** Starts the timer (label "Reheat", scope meal:<date>/<slot>); does nothing when one already exists. */
  start: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** Cancels the timer (it is deleted). */
  cancel: () => Promise<void>
}

/** Reheat's timer state for one Planned Meal (R12). Composes useTimers() and lib/reheat; renders nothing. */
export function useReheat(key: SlotKey, portions: number, reheatMinutes?: number | null, onError?: () => void): UseReheat {
  const timers = useTimers()
  const scope = scopeOf({ kind: 'meal', date: key.date, mealSlotId: key.mealSlotId })
  const [chosen, setChosen] = useState(() => defaultReheatSeconds(portions, reheatMinutes))
  const timer = reheatTimerOf(timers.timers, scope)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const secondsLeft = timer ? (timers.items.find((i) => i.timer.id === timer.id)?.seconds ?? 0) : 0

  // A failed action is reported to the caller (a toast), never left as an unhandled rejection.
  const guarded = async (run: () => Promise<unknown>) => {
    try {
      await run()
    } catch {
      onError?.()
    }
  }

  return {
    durationSeconds: chosen,
    adjust: (delta) => {
      if (!timer) setChosen((c) => adjustReheatSeconds(c, delta))
    },
    timer,
    secondsLeft,
    starting,
    start: async () => {
      if (timer || startingRef.current) return
      startingRef.current = true
      setStarting(true)
      try {
        await guarded(() => timers.start({ scope, label: REHEAT_LABEL, durationSeconds: chosen }))
      } finally {
        startingRef.current = false
        setStarting(false)
      }
    },
    pause: () => guarded(async () => timer && timers.pause(timer.id)),
    resume: () => guarded(async () => timer && timers.resume(timer.id)),
    cancel: () => guarded(async () => timer && timers.cancel(timer.id)),
  }
}

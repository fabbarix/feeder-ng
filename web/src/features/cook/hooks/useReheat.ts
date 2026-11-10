import type { SlotKey } from '../../plan/types'
import type { CookTimer } from '../types'

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

/**
 * Reheat's timer state for one Planned Meal (R12). Composes useTimers() and lib/reheat; renders nothing.
 * R12 STUB: the developer implements it; useReheat.test.tsx is red.
 */
export function useReheat(_key: SlotKey, _portions: number): UseReheat {
  throw new Error('R12: useReheat is not implemented')
}

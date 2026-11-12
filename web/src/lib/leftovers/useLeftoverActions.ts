// The Leftovers query and the hand actions (react-query). STUB (red). Not exported from the pure barrel index.ts.
import type { Leftover, LeftoverAnswer, LeftoverRequest } from './types'

export interface LeftoversState {
  leftovers: Leftover[]
  isPending: boolean
  isError: boolean
}

/** `GET /api/plan/leftovers` under the key the plan feature already uses (`['plan', 'leftovers']`). */
export function useLeftovers(): LeftoversState {
  return { leftovers: [], isPending: false, isError: false }
}

export interface LeftoverActions {
  /**
   * Runs the confirmed sheet. On success: toast (copy.ts), refresh Leftovers, the plan and the Pantry, resolve true.
   * On failure: an error toast with `actionError`, nothing refreshed, resolve false.
   */
  run: (leftover: Pick<Leftover, 'id' | 'recipeName'>, request: LeftoverRequest) => Promise<boolean>
  /** The three buttons of the question row. Same toast and refresh rules. */
  answer: (leftover: Pick<Leftover, 'id' | 'recipeName'>, answer: LeftoverAnswer) => Promise<boolean>
  /** True while a call is in flight (disables the sheet's confirm button). */
  busy: boolean
}

export function useLeftoverActions(_opts: { today: string }): LeftoverActions {
  return { run: () => Promise.resolve(false), answer: () => Promise.resolve(false), busy: false }
}

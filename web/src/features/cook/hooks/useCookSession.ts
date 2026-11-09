import type { AdvanceSummary } from '../lib/advance'
import type { StepNav } from '../lib/steps'
import type { CookSource, CookStep, CookView } from '../types'

export interface UseCookSession {
  view: CookView | undefined
  isLoading: boolean
  error: Error | null
  /** The server answered 409 not_cookable (the meal is already cooked or skipped). */
  notCookable: boolean
  nav: StepNav
  /** The Step on screen; null for a Recipe with no Steps. */
  step: CookStep | null
  next(): void
  back(): void
  /** Bumped by repeat(); the screen uses it to re-announce or re-read the Step. */
  repeatCount: number
  repeat(): void
  advance: AdvanceSummary
  markAdvanceDone(stepIndex: number): Promise<void>
  /** Start (or re-use, server side) the timer of the Passive Step on screen. No-op on other Steps. */
  startStepTimer(): Promise<void>
  isFirst: boolean
  isLast: boolean
  /** The Planned Meal for T11's Mark as Cooked sheet; null for a Recipe scope. */
  markCookedKey: { date: string; mealSlotId: number } | null
  scope: string
}

/**
 * Cook Mode state for one source. react-query ['cook','view',scope] fed by
 * cookApi.view(source). Refetches on SSE topic `cook` (marks changed elsewhere).
 * Reaching a Passive Step (by next/back, or because it is the first Step) starts
 * its timer once per Step per session through cookApi.startTimer({scope, step: index})
 * (the server keeps one timer per Step, so a second device is safe too).
 */
export function useCookSession(_source: CookSource): UseCookSession {
  throw new Error('TODO')
}

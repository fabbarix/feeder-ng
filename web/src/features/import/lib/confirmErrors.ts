// BR-E (design §10, §11.3): the refusals of Confirm that concern Base recipes, read from the ApiError exactly as internal/recipefile sends them.
import { parseTakeOver } from '../../../lib/baseRecipes/takeOver'
import { refusalMessage } from '../../../lib/baseRecipes/refusals'
import { ApiError } from '../../../lib/http'
import type { Plan } from '../types'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'

/** What Confirm refused, as the review shows it. `takeOver` is the P7 ask; `validation` a refused answer; `notReady` a plan with open questions. */
export type ConfirmProblem =
  | { kind: 'cycle'; message: string; path: string[] }
  | { kind: 'takeOver'; ask: TakeOverAsk }
  | { kind: 'validation'; reason: string | undefined; message: string }
  | { kind: 'notReady'; message: string; plan: Plan }

/** The refusal of a Confirm as a ConfirmProblem; null for any other error (import_stale, forbidden, a network error), which the review handles itself. */
export function confirmProblem(err: unknown): ConfirmProblem | null {
  if (!(err instanceof ApiError)) return null
  if (err.code === 'base_recipe_cycle') {
    return { kind: 'cycle', message: err.message, path: (err.details.path as string[] | undefined) ?? [] }
  }
  if (err.code === 'base_recipe_take_over') {
    const ask = parseTakeOver(err)
    return ask ? { kind: 'takeOver', ask } : null
  }
  if (err.code === 'validation_failed') {
    const reason = typeof err.details.reason === 'string' ? err.details.reason : undefined
    return { kind: 'validation', reason, message: refusalMessage(err) ?? err.message }
  }
  if (err.code === 'import_not_ready') {
    return { kind: 'notReady', message: err.message, plan: err.details.plan as Plan }
  }
  return null
}

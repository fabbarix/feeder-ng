import type { Plan, FileError, Decisions, ImportResult, BaseUnit, RecipeAction } from '../types'

export interface UseImportReview {
  phase: 'source' | 'reviewing' | 'done'
  plan: Plan | undefined
  decisions: Decisions
  error: FileError | undefined
  /** True while a request is in flight (opening, re-planning or confirming). */
  busy: boolean
  /** True after a Confirm refused with import_stale. */
  stale: boolean
  result: ImportResult | undefined
  /** Opens the review from the file text; phase becomes 'reviewing', or `error` is set and the phase stays 'source'. */
  open: (text: string) => Promise<void>
  chooseExisting: (key: string, ingredientId: number) => void
  chooseCreate: (key: string, opts?: { name?: string; baseUnit?: BaseUnit }) => void
  answerConversion: (key: string, unit: string, toBase: number) => void
  chooseRecipeAction: (index: number, action: RecipeAction) => void
  /** Saves everything. On success phase becomes 'done' and the Recipe, Ingredient and Tag queries are invalidated. */
  confirm: () => Promise<void>
  /** Discards the server-side review and returns to the source step. */
  reset: () => Promise<void>
}

/**
 * Import Review state. Each answer is applied with lib/decisions and sent to `importApi.plan`; the returned
 * plan replaces the shown one (the last request wins). `confirm` sends the current decisions.
 * An import_not_ready answer replaces the plan with the server's; import_stale sets `stale`.
 */
export function useImportReview(): UseImportReview {
  throw new Error('not implemented')
}

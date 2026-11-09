// Pure view-model of an Import Review: which step tiles to show and how much is still open.
import type { IngredientMatch, Plan } from '../types'

export type StepId = 'problems' | 'ingredients' | 'units' | 'recipes' | 'images'

export interface StepTile {
  id: StepId
  /** Rows in the tile. */
  total: number
  /** Rows still needing an answer (blocking). */
  open: number
}

/**
 * The tiles to show, in this order: problems (only when there are any), ingredients (always),
 * units (only with prompts), recipes (only when some Recipe conflicts), images (only with warnings).
 * `open` counts unresolved Ingredients, unanswered unit prompts, unresolved Recipe conflicts and problems;
 * images are never blocking (open 0).
 */
export function reviewSteps(plan: Plan): StepTile[] {
  void plan
  throw new Error('not implemented')
}

/** Everything still blocking Confirm: sum of `open` over reviewSteps. */
export function openCount(plan: Plan): number {
  void plan
  throw new Error('not implemented')
}

/** Confirm is possible only when the server says the plan is ready. */
export function canConfirm(plan: Plan, busy: boolean): boolean {
  void plan; void busy
  throw new Error('not implemented')
}

/** The choices to show for an Ingredient row: existing match first, then suggestions, then "create". */
export function ingredientOptions(m: IngredientMatch): Array<{ kind: 'existing' | 'suggestion' | 'create'; id?: number; label: string }> {
  void m
  throw new Error('not implemented')
}

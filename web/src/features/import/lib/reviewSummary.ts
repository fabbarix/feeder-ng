// Pure view-model of an Import Review: which step tiles to show and how much is still open.
import type { IngredientMatch, Plan } from '../types'
import { questionRows } from './courseRows'

export type StepId = 'problems' | 'ingredients' | 'units' | 'courses' | 'recipes' | 'images'

export interface StepTile {
  id: StepId
  /** Rows in the tile. */
  total: number
  /** Rows still needing an answer (blocking). */
  open: number
}

/**
 * The tiles to show, in this order: problems (only when there are any), ingredients (always),
 * units (only with prompts), Courses (only with unknown or archived names), recipes (only when some Recipe conflicts), images (only with warnings).
 * `open` counts unresolved Ingredients, unanswered unit prompts, unresolved Courses, unresolved Recipe conflicts and problems;
 * images are never blocking (open 0).
 */
export function reviewSteps(plan: Plan): StepTile[] {
  const tiles: StepTile[] = []
  if (plan.problems.length > 0) {
    tiles.push({ id: 'problems', total: plan.problems.length, open: plan.problems.length })
  }
  tiles.push({
    id: 'ingredients',
    total: plan.ingredients.length,
    open: plan.ingredients.filter((m) => !m.resolved).length,
  })
  if (plan.unitPrompts.length > 0) {
    tiles.push({ id: 'units', total: plan.unitPrompts.length, open: plan.unitPrompts.filter((p) => !p.answered).length })
  }
  // CRS E2: the Course names that ask something (unknown or archived); a matched name needs no tile.
  const courses = questionRows(plan.courses)
  if (courses.length > 0) {
    tiles.push({ id: 'courses', total: courses.length, open: courses.filter((c) => !c.resolved).length })
  }
  const conflicts = plan.recipes.filter((r) => r.status === 'conflict')
  if (conflicts.length > 0) {
    tiles.push({ id: 'recipes', total: conflicts.length, open: conflicts.filter((r) => !r.resolved).length })
  }
  if (plan.warnings.length > 0) {
    tiles.push({ id: 'images', total: plan.warnings.length, open: 0 })
  }
  return tiles
}

/** Everything still blocking Confirm: sum of `open` over reviewSteps. */
export function openCount(plan: Plan): number {
  return reviewSteps(plan).reduce((sum, t) => sum + t.open, 0)
}

/** Confirm is possible only when the server says the plan is ready. */
export function canConfirm(plan: Plan, busy: boolean): boolean {
  return plan.ready && !busy
}

export interface IngredientOption {
  kind: 'existing' | 'suggestion' | 'create'
  id?: number
  label: string
}

/** The choices to show for an Ingredient row: existing match first, then suggestions, then "create". */
export function ingredientOptions(m: IngredientMatch): IngredientOption[] {
  const out: IngredientOption[] = []
  if (m.match) out.push({ kind: 'existing', id: m.match.id, label: m.match.name })
  for (const s of m.suggestions) out.push({ kind: 'suggestion', id: s.id, label: s.name })
  out.push({ kind: 'create', label: m.name })
  return out
}

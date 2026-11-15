// Pure view-model of an Import Review: which step tiles to show and how much is still open.
import type { ImportResult, IngredientMatch, Plan, RecipeStatus, UnitPrompt } from '../types'
import { questionRows } from './courseRows'
import { unansweredCount } from './baseRecipeLines'

export type StepId = 'problems' | 'ingredients' | 'baseRecipes' | 'units' | 'courses' | 'recipes' | 'images'

export interface StepTile {
  id: StepId
  /** Rows in the tile. */
  total: number
  /** Rows still needing an answer (blocking). */
  open: number
}

/**
 * The tiles to show, in this order: problems (only when there are any), ingredients (always), Base recipes (only with a Base recipe
 * line or take-over ask), units (only with prompts), Courses (only with unknown or archived names), recipes (only when some Recipe conflicts), images (only with warnings).
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
  // BR-E: one row per Base recipe line, and each take-over ask that no line carries.
  const asksOnLines = plan.takeOvers.filter((a) => plan.baseRecipeLines.some((l) => l.path === a.path))
  const standaloneAsks = plan.takeOvers.length - asksOnLines.length
  if (plan.baseRecipeLines.length > 0 || standaloneAsks > 0) {
    tiles.push({ id: 'baseRecipes', total: plan.baseRecipeLines.length + standaloneAsks, open: unansweredCount(plan) })
  }
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

/** Confirm is possible only when the server says the plan is ready and every Base recipe question is answered (BR-E: nothing is linked silently). */
export function canConfirm(plan: Plan, busy: boolean): boolean {
  return plan.ready && !busy && unansweredCount(plan) === 0
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

// ---- B9-28 (RX-01, RX-12): stubs. The tests of reviewSummary.rx.test.ts pin the behaviour; nothing below is built yet. ----

/** One open question of the review, in page order. `id` is the key of the row that asks it (see openQuestions). */
export interface Question {
  kind: 'recipe' | 'baseLine' | 'course' | 'ingredient' | 'unit'
  id: string
}

/** The state shown at a row's end: `text`, and the info tone while the row asks something. */
export interface RowState {
  text: string
  tone?: 'info'
}

/** The Recipe, Ingredient and skipped counts of the notice, the Recipes tile and the bar. */
export interface ReviewCounts {
  /** Recipes of the file that the import will save (not skipped). */
  recipes: number
  skipped: number
  ingredients: number
}

/** A row of "Also added" in the result. */
export interface AddedRow {
  key: 'ingredients' | 'conversions' | 'courses' | 'coursesBack'
  label: string
  state: string
  detail?: string
}

export function openQuestions(_plan: Plan): Question[] {
  throw new Error('not implemented')
}
export function reviewCounts(_plan: Plan): ReviewCounts {
  throw new Error('not implemented')
}
export function recipeRowState(_r: RecipeStatus): RowState {
  throw new Error('not implemented')
}
export function recipeRowMeta(_r: RecipeStatus): string {
  throw new Error('not implemented')
}
export function resultRowState(_r: ImportResult['recipes'][number], _status?: RecipeStatus): string {
  throw new Error('not implemented')
}
export function resultRowMeta(_status: RecipeStatus): string {
  throw new Error('not implemented')
}
export function addedRows(_result: ImportResult, _plan: Plan): AddedRow[] {
  throw new Error('not implemented')
}
export function ingredientRowState(_m: IngredientMatch, _openPrompt?: UnitPrompt): RowState {
  throw new Error('not implemented')
}
export function ingredientRowMeta(_m: IngredientMatch, _openPrompt?: UnitPrompt): string {
  throw new Error('not implemented')
}
export function orderIngredientRows(_plan: Plan): IngredientMatch[] {
  throw new Error('not implemented')
}
export function exactMatches(_plan: Plan): IngredientMatch[] {
  throw new Error('not implemented')
}

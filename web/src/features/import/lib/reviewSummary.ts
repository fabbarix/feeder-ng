// Pure view-model of an Import Review: which step tiles to show and how much is still open.
import { formatMinutes } from '../../recipes/lib/time'
import { displayName } from '../../ingredients/lib/names'
import { importStrings } from '../strings'
import type { Decisions, ImportResult, IngredientMatch, Plan, PreviewLine, PreviewStep, RecipePreview, RecipeStatus, UnitPrompt } from '../types'
import { questionRows } from './courseRows'
import { standaloneAsks, unansweredCount } from './baseRecipeLines'

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

// ---- B9-28 (RX-01, RX-12): the Recipes tile, the questions, the result and the Ingredient rows. ----

const t = importStrings.reviewRows

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

/** The row id of a Recipe, a Course and an Ingredient: the target a question jumps to. */
export const recipeRowId = (index: number): string => `recipe-${index}`
export const courseRowId = (key: string): string => `course-${key}`
export const ingredientRowId = (key: string): string => `ingredient-${key}`
export const takeOverRowId = (path: string): string => `takeover-${path}`

/** The unit questions of an Ingredient that are still open. */
function openPrompts(plan: Plan, key: string): UnitPrompt[] {
  return plan.unitPrompts.filter((p) => p.key === key && !p.answered)
}

/**
 * The unanswered questions in page order: Recipe conflicts, Base recipe lines (each followed by its take-over ask, then the asks no
 * line carries), Courses, then the Ingredients in row order (an unresolved row, then each open unit question of it), and last the unit
 * questions of an Ingredient that has no row. A unit question's id is its Ingredient's row. Problems are not questions.
 */
export function openQuestions(plan: Plan): Question[] {
  const out: Question[] = []
  for (const r of plan.recipes) if (r.status === 'conflict' && !r.resolved) out.push({ kind: 'recipe', id: recipeRowId(r.index) })
  for (const line of plan.baseRecipeLines) {
    if (!line.resolved) out.push({ kind: 'baseLine', id: line.path })
    const ask = plan.takeOvers.find((a) => a.path === line.path)
    if (ask && !ask.resolved) out.push({ kind: 'baseLine', id: takeOverRowId(ask.path) })
  }
  for (const ask of standaloneAsks(plan)) if (!ask.resolved) out.push({ kind: 'baseLine', id: takeOverRowId(ask.path) })
  for (const c of questionRows(plan.courses)) if (!c.resolved) out.push({ kind: 'course', id: courseRowId(c.key) })
  for (const m of orderIngredientRows(plan)) {
    if (!m.resolved) out.push({ kind: 'ingredient', id: ingredientRowId(m.key) })
    for (const _ of openPrompts(plan, m.key)) out.push({ kind: 'unit', id: ingredientRowId(m.key) })
  }
  const keys = new Set(plan.ingredients.map((m) => m.key))
  for (const p of plan.unitPrompts) if (!p.answered && !keys.has(p.key)) out.push({ kind: 'unit', id: ingredientRowId(p.key) })
  return out
}

const isSkipped = (r: RecipeStatus): boolean => r.action === 'skip'

export function reviewCounts(plan: Plan): ReviewCounts {
  const skipped = plan.recipes.filter(isSkipped).length
  return { recipes: plan.recipes.length - skipped, skipped, ingredients: plan.ingredients.length }
}

export function recipeRowState(r: RecipeStatus): RowState {
  if (r.status !== 'conflict') return { text: t.stateNew }
  if (!r.resolved || !r.action) return { text: t.stateChoose, tone: 'info' }
  switch (r.action) {
    case 'replace':
      return { text: t.stateReplaces }
    case 'keep_both':
      return { text: t.keptAs(r.importedAs ?? r.name) }
    case 'skip':
      return { text: t.stateSkipped }
  }
}

const num = (n: number): string => String(Math.round(n * 1000) / 1000)

/** "Ready Meal · 2 portions" or "Base recipe · 1 l"; undefined for a plannable Recipe. */
function kindMeta(p: RecipePreview): string | undefined {
  if (p.baseRecipe) return `${t.baseRecipe} · ${[num(p.yield), p.yieldUnit].filter(Boolean).join(' ')}`
  if (p.readyMeal) return `${t.readyMeal} · ${t.portions(p.yield)}`
  return undefined
}

/** "4 portions · 7 Ingredients · 5 Steps · Main", "Ready Meal · 2 portions", "Base recipe · 1 l". */
export function recipeRowMeta(r: RecipeStatus): string {
  const p = r.preview
  const kind = kindMeta(p)
  if (kind) return kind
  const parts = [t.portions(p.yield), t.ingredients(p.lines.length), t.steps(p.steps.length)]
  if (p.courses.length > 0) parts.push(p.courses.join(', '))
  return parts.join(' · ')
}

export function resultRowState(r: ImportResult['recipes'][number], status?: RecipeStatus): string {
  if (r.action === 'converted') return t.nowBase
  if (r.action === 'replaced') return t.replaced
  if (status?.action === 'keep_both') return t.keptAs(status.importedAs ?? r.name)
  return t.created
}

/** "Main · 4 portions · 5 Steps", "Ready Meal · 2 portions", "Base recipe · 1 l". */
export function resultRowMeta(status: RecipeStatus): string {
  const p = status.preview
  const kind = kindMeta(p)
  if (kind) return kind
  const parts = p.courses.length > 0 ? [p.courses.join(', ')] : []
  parts.push(t.portions(p.yield), t.steps(p.steps.length))
  return parts.join(' · ')
}

const names = (list: string[]): string | undefined => (list.length > 0 ? list.join(', ') : undefined)
function added(key: AddedRow['key'], label: string, n: number, list: string[]): AddedRow {
  const detail = names(list)
  return detail ? { key, label, state: String(n), detail } : { key, label, state: String(n) }
}

/** "Also added": Ingredients created, Unit Conversions added, Courses added and brought back, each with its names from the confirmed plan. */
export function addedRows(result: ImportResult, plan: Plan): AddedRow[] {
  const rows: AddedRow[] = []
  if (result.ingredientsCreated > 0) {
    const created = plan.ingredients.filter((m) => m.effective?.action === 'create').map((m) => displayName(m.effective?.name ?? m.name))
    rows.push(added('ingredients', t.ingredientsCreated, result.ingredientsCreated, created))
  }
  if (result.conversionsAdded > 0) {
    const answered = plan.unitPrompts.filter((p) => p.answered && p.toBase !== undefined).map((p) => t.conversion(displayName(p.ingredient), p.unit, num(p.toBase!), p.base))
    rows.push(added('conversions', t.conversionsAdded, result.conversionsAdded, answered))
  }
  const created = result.coursesCreated ?? 0
  if (created > 0) rows.push(added('courses', t.coursesAdded, created, plan.courses.filter((c) => c.effective?.action === 'add').map((c) => c.name)))
  const back = result.coursesUnarchived ?? 0
  if (back > 0) rows.push(added('coursesBack', t.coursesBack, back, plan.courses.filter((c) => c.effective?.action === 'unarchive').map((c) => c.name)))
  return rows
}

/** The name of the Ingredient a row resolves to when it uses an existing one: the chosen suggestion, else the match. */
function usedName(m: IngredientMatch): string | undefined {
  const e = m.effective
  if (e?.action !== 'use') return undefined
  return m.suggestions.find((x) => x.id === e.ingredientId)?.name ?? m.match?.name
}

export function ingredientRowState(m: IngredientMatch, openPrompt?: UnitPrompt): RowState {
  if (openPrompt || !m.resolved) return { text: t.oneQuestion, tone: 'info' }
  if (m.status === 'exact') return { text: t.matches }
  const used = usedName(m)
  if (used) return { text: t.uses(displayName(used)) }
  if (m.status === 'suggested') return { text: importStrings.createNew }
  return { text: t.stateNew }
}

export function ingredientRowMeta(m: IngredientMatch, openPrompt?: UnitPrompt): string {
  if (openPrompt) return t.unitQuestion(openPrompt.base, openPrompt.unit)
  if (!m.resolved && m.status === 'undefined') return t.chooseBaseUnit
  if (m.status === 'conflict' && m.conflict && !m.resolved) return importStrings.conflictText(m.conflict.file, m.conflict.existing)
  if (m.addsImage) return t.addsPicture(displayName(usedName(m) ?? m.match?.name ?? m.name))
  if (m.status === 'suggested' && m.suggestions[0]) return t.similarTo(displayName(m.suggestions[0].name))
  if (m.status === 'exact' && m.match) return t.baseUnit(m.match.baseUnit)
  const unit = m.effective?.baseUnit ?? m.definition?.baseUnit ?? (m.effective?.action === 'use' ? m.match?.baseUnit : undefined)
  return unit ? t.baseUnit(unit) : ''
}

const byName = (a: IngredientMatch, b: IngredientMatch): number => a.name.localeCompare(b.name)

/** An exact match with nothing to ask: it closes the list in one row. */
function quietExact(plan: Plan, m: IngredientMatch): boolean {
  return m.status === 'exact' && m.resolved && openPrompts(plan, m.key).length === 0
}

/** The Ingredient rows: the questions first (an unresolved row, or one with an open unit question), then the rest, each by name. */
export function orderIngredientRows(plan: Plan): IngredientMatch[] {
  const rows = plan.ingredients.filter((m) => !quietExact(plan, m))
  const asks = (m: IngredientMatch) => !m.resolved || openPrompts(plan, m.key).length > 0
  return [...rows.filter(asks).sort(byName), ...rows.filter((m) => !asks(m)).sort(byName)]
}

/** The exact matches that ask nothing, by name: the closing "N match your Ingredients" row. */
export function exactMatches(plan: Plan): IngredientMatch[] {
  return plan.ingredients.filter((m) => quietExact(plan, m)).sort(byName)
}

/** The first open unit question of an Ingredient, if any. */
export function openPromptFor(plan: Plan, key: string): UnitPrompt | undefined {
  return openPrompts(plan, key)[0]
}

/** The unit questions whose Ingredient has no row of its own (asked on a row of their own). */
export function orphanPrompts(plan: Plan): UnitPrompt[] {
  const keys = new Set(plan.ingredients.map((m) => m.key))
  return plan.unitPrompts.filter((p) => !p.answered && !keys.has(p.key))
}

// ---- The read-only panel of a Recipe row (RX-01) ----

/** An Ingredient line as a row: name, quantity as state, note or Optional as detail. */
export function previewLineRow(l: PreviewLine): { key: string; state: string; detail?: string } {
  const detail = [l.recipe ? t.baseRecipe : '', l.note ?? '', l.optional ? t.optional : ''].filter(Boolean).join(' · ')
  // "2 pieces", never "2 piece" (lib/units: piece is plural unless the amount is 1); the file's other units stay as written.
  const unit = l.unit === 'piece' && l.quantity !== 1 ? 'pieces' : l.unit
  return { key: displayName(l.ingredient), state: [num(l.quantity), unit].filter(Boolean).join(' '), detail: detail || undefined }
}

/** A Step as a row: the time as state ("4 h before", "25 min", '' untimed) and the kind as detail. */
export function previewStepRow(s: PreviewStep): { state: string; detail: string } {
  const kind = t.stepKind[s.kind] ?? s.kind
  if (s.kind === 'advance' && s.leadTimeMinutes > 0) return { state: t.before(formatMinutes(s.leadTimeMinutes)), detail: kind }
  return { state: s.durationMinutes > 0 ? formatMinutes(s.durationMinutes) : '', detail: kind }
}

/** "Courses: Main · Tags: chicken, traybake · Source: example.test"; '' when the file gives none of them. */
export function previewFacts(p: RecipePreview): string {
  const parts: string[] = []
  if (p.courses.length > 0) parts.push(t.coursesFact(p.courses.join(', ')))
  if (p.tags.length > 0) parts.push(t.tagsFact(p.tags.join(', ')))
  const source = sourceName(p.source)
  if (source) parts.push(t.sourceFact(source))
  return parts.join(' · ')
}

function sourceName(source: RecipePreview['source']): string | undefined {
  if (!source) return undefined
  if (source.url) {
    try {
      return new URL(source.url).host
    } catch {
      return source.url
    }
  }
  return source.attribution || undefined
}

/** Whether any answer was given in the review (Start over then asks before discarding them). */
export function answersGiven(d: Decisions): boolean {
  return (
    d.ingredients.length + d.conversions.length + d.recipes.length + d.courses.length > 0 ||
    Object.keys(d.baseRecipeLines ?? {}).length > 0 ||
    Object.keys(d.takeOvers ?? {}).length > 0
  )
}

/** The Ingredient rows that ask something, for the tile's meta ("9 · 1 to answer"). */
export function ingredientQuestionCount(plan: Plan): number {
  return plan.ingredients.filter((m) => !m.resolved || openPrompts(plan, m.key).length > 0).length + orphanPrompts(plan).length
}

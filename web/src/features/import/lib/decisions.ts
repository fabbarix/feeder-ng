// Pure helpers that build the answers sent to the server. Every function returns a new object and leaves the input untouched.
import type { BaseRecipeAnswer, BaseUnit, ConversionAnswer, CourseDecision, Decisions, IngredientDecision, RecipeAction, RecipeDecision } from './../types'

/** No answers yet. */
export function emptyDecisions(): Decisions {
  return { ingredients: [], conversions: [], recipes: [], courses: [] }
}

/** Replaces the entry matching `same`, or appends `entry` when there is none. */
function upsert<T>(list: readonly T[], same: (x: T) => boolean, entry: T): T[] {
  return list.some(same) ? list.map((x) => (same(x) ? entry : x)) : [...list, entry]
}

/** Answer an Ingredient with an existing one. Replaces an earlier answer for the same key. */
export function chooseExisting(d: Decisions, key: string, ingredientId: number): Decisions {
  const answer: IngredientDecision = { key, action: 'use', ingredientId }
  return { ...d, ingredients: upsert(d.ingredients, (x) => x.key === key, answer) }
}

/** Answer an Ingredient with "create": optionally under a new name, and/or with a Base Unit (for an Ingredient the file does not define). Empty/blank name is left out. */
export function chooseCreate(d: Decisions, key: string, opts?: { name?: string; baseUnit?: BaseUnit }): Decisions {
  const answer: IngredientDecision = { key, action: 'create' }
  const name = opts?.name?.trim()
  if (name) answer.name = name
  if (opts?.baseUnit) answer.baseUnit = opts.baseUnit
  return { ...d, ingredients: upsert(d.ingredients, (x) => x.key === key, answer) }
}

/** Remove the answer for an Ingredient. */
export function clearIngredient(d: Decisions, key: string): Decisions {
  return { ...d, ingredients: d.ingredients.filter((x) => x.key !== key) }
}

/** Answer a unit prompt. The unit is trimmed and lower-cased; replaces an earlier answer for the same key + unit. */
export function answerConversion(d: Decisions, key: string, unit: string, toBase: number): Decisions {
  const u = unit.trim().toLowerCase()
  const answer: ConversionAnswer = { key, unit: u, toBase }
  return { ...d, conversions: upsert(d.conversions, (x) => x.key === key && x.unit === u, answer) }
}

/** Answer a Recipe conflict. Replaces an earlier answer for the same index. */
export function chooseRecipeAction(d: Decisions, index: number, action: RecipeAction): Decisions {
  const answer: RecipeDecision = { index, action }
  return { ...d, recipes: upsert(d.recipes, (x) => x.index === index, answer) }
}

/** Reads the amount typed for a Unit Conversion: a number above 0 (comma or point as decimal separator), else null. */
export function parseToBase(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?(e\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ---- CRS E2: Course answers (docs/dev/design/crs-e2.md 4) ----

/** Replaces the Course answer of the same key (in place), or appends it. */
function courseUpsert(d: Decisions, entry: CourseDecision): Decisions {
  return { ...d, courses: upsert(d.courses, (x) => x.key === entry.key, entry) }
}

/** Answer a Course name with an existing active Course. Replaces an earlier answer for the same key. */
export function chooseCourseUse(d: Decisions, key: string, courseId: number): Decisions {
  return courseUpsert(d, { key, action: 'use', courseId })
}

/** Leave a Course name out. */
export function chooseCourseSkip(d: Decisions, key: string): Decisions {
  return courseUpsert(d, { key, action: 'skip' })
}

/** Add the name as a new Course (Admin only). */
export function chooseCourseAdd(d: Decisions, key: string): Decisions {
  return courseUpsert(d, { key, action: 'add' })
}

/** Bring an archived Course back (Admin only). */
export function chooseCourseUnarchive(d: Decisions, key: string): Decisions {
  return courseUpsert(d, { key, action: 'unarchive' })
}

/** The answers a non-Admin cannot give (`add`, `unarchive`) taken out, everything else kept; used after a 403. */
export function dropAdminCourseAnswers(d: Decisions): Decisions {
  return { ...d, courses: d.courses.filter((c) => c.action !== 'add' && c.action !== 'unarchive') }
}

// ---- BR-E: Base recipe answers (docs/dev/design/base-recipes.md §11.3) ----

/** Copies a record without one key. */
function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const out = { ...record }
  delete out[key]
  return out
}

/** Answers a Base recipe tile by its line path. A new answer also drops the take-over answer of that path (the ask may no longer apply). */
export function chooseBaseRecipeLine(d: Decisions, path: string, answer: BaseRecipeAnswer): Decisions {
  const next: Decisions = { ...d, baseRecipeLines: { ...(d.baseRecipeLines ?? {}), [path]: answer } }
  if (d.takeOvers && path in d.takeOvers) next.takeOvers = omitKey(d.takeOvers, path)
  return next
}

/** Answers a take-over ask by its path: true takes the Ingredient over, false keeps it apart. */
export function chooseTakeOver(d: Decisions, path: string, yes: boolean): Decisions {
  return { ...d, takeOvers: { ...(d.takeOvers ?? {}), [path]: yes } }
}

/** Removes a tile's answer and its take-over answer. */
export function clearBaseRecipeLine(d: Decisions, path: string): Decisions {
  const next: Decisions = { ...d }
  if (d.baseRecipeLines) next.baseRecipeLines = omitKey(d.baseRecipeLines, path)
  if (d.takeOvers) next.takeOvers = omitKey(d.takeOvers, path)
  return next
}

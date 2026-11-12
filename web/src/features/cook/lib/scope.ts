// The scope string of a cook session, as the server names it, and how a route opens one. Plain TypeScript.
import type { CookSource, CookTimelineTarget } from '../types'

/** "meal:<date>/<mealSlotId>/<courseId>" for a Planned Meal (its Course is required), "recipe:<id>" for a Recipe. */
export function scopeOf(source: CookSource): string {
  if (source.kind === 'meal') {
    if (!Number.isInteger(source.courseId) || source.courseId <= 0) throw new Error('a Planned Meal needs its Course')
    return courseScope(source.date, source.mealSlotId, source.courseId)
  }
  return `recipe:${source.recipeId}`
}

/** The route params Cook Mode opens with: a Planned Meal (date + slot) or a Recipe (id). */
export interface CookRouteParams {
  date?: string
  slotId?: string
  /** The Course of a timeline opened on one Course (/cook/meal/:date/:slotId/:courseId). */
  courseId?: string
  id?: string
}

/** Batches from ?batches=, default 1; anything that is not a number above zero is 1. */
export function batchesFrom(raw: string | null): number {
  const n = raw === null || raw.trim() === '' ? 1 : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** The cook session a route opens: /cook/meal/:date/:slotId or /cook/recipe/:id?batches=. */
export function cookSourceFrom(params: CookRouteParams, batches: string | null): CookSource {
  if (params.date !== undefined && params.slotId !== undefined && params.courseId !== undefined) {
    return { kind: 'meal', date: params.date, mealSlotId: Number(params.slotId), courseId: Number(params.courseId) }
  }
  return { kind: 'recipe', recipeId: Number(params.id), batches: batchesFrom(batches) }
}

/**
 * The route that opens Cook Mode for a Recipe with a Batch count (Recipe detail's Cook/Batch entry links here):
 * `/cook/recipe/<id>?batches=<n>`. batches defaults to 1 and is left out when it is 1; a count that is not a number
 * above zero counts as 1; the number is written plainly (1.5, 2), never in exponent form.
 */
export function cookRecipePath(recipeId: number, batches = 1): string {
  const count = Number.isFinite(batches) && batches > 0 ? batches : 1
  const base = `/cook/recipe/${recipeId}`
  if (count === 1) return base
  // Intl keeps the number plain (no exponent form), e.g. 1.5 or 2.
  const plain = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 20 }).format(count)
  return `${base}?batches=${plain}`
}

/** The route that opens Cook Mode for a Planned Meal: `/cook/meal/<YYYY-MM-DD>/<mealSlotId>`. */
export function cookMealPath(date: string, mealSlotId: number): string {
  return `/cook/meal/${date}/${mealSlotId}`
}

/** Where Exit goes: a Recipe session leaves to `/recipes/<id>`, a Planned Meal session to Today (`/`). */
export function exitPathFor(source: CookSource): string {
  return source.kind === 'recipe' ? `/recipes/${source.recipeId}` : '/'
}

// ---- CRS F: Course scopes and the cooking timeline's route (spec 11). ----

/** "meal:<date>/<mealSlotId>/<courseId>": the three-part scope of one Course's Planned Meal. */
export function courseScope(date: string, mealSlotId: number, courseId: number): string {
  return `meal:${date}/${mealSlotId}/${courseId}`
}

export interface MealScopeParts {
  date: string
  mealSlotId: number
  courseId: number
}

const MEAL_SCOPE = /^meal:(\d{4}-\d{2}-\d{2})\/(\d+)\/(\d+)$/

/** Reads "meal:<date>/<slotId>/<courseId>" (crs-c3: the two-part form is no scope); null for a recipe scope, a free timer (null) or anything else. */
export function parseMealScope(scope: string | null | undefined): MealScopeParts | null {
  if (!scope) return null
  const m = MEAL_SCOPE.exec(scope)
  if (!m) return null
  const courseId = Number(m[3])
  if (courseId <= 0) return null
  return { date: m[1]!, mealSlotId: Number(m[2]), courseId }
}

/**
 * THE ONE place cook scopes are compared (crs-c3 §4). Two Planned Meal scopes are the same when date, slot and Course
 * match. Recipe scopes and anything that is not a Planned Meal scope compare as plain strings; null is never a scope.
 */
export function sameScope(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false
  const pa = parseMealScope(a)
  const pb = parseMealScope(b)
  if (!pa || !pb) return a === b
  return pa.date === pb.date && pa.mealSlotId === pb.mealSlotId && pa.courseId === pb.courseId
}

/** `/cook/meal/<date>/<slotId>` (the timeline) or `/cook/meal/<date>/<slotId>/<courseId>` (opened on that Course). */
export function cookTimelinePath(date: string, mealSlotId: number, courseId?: number): string {
  const base = `/cook/meal/${date}/${mealSlotId}`
  return courseId === undefined ? base : `${base}/${courseId}`
}

/** The target of the route params `{ date, slotId, courseId? }`; null when date or slot is missing. */
export function timelineTargetFrom(params: { date?: string; slotId?: string; courseId?: string }): CookTimelineTarget | null {
  if (params.date === undefined || params.slotId === undefined) return null
  const target: CookTimelineTarget = { date: params.date, mealSlotId: Number(params.slotId) }
  if (params.courseId !== undefined) target.courseId = Number(params.courseId)
  return target
}

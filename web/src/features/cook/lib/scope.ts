// The scope string of a cook session, as the server names it, and how a route opens one. Plain TypeScript.
import type { CookSource, CookTimelineTarget } from '../types'

/** "meal:<date>/<mealSlotId>" for a Planned Meal, "recipe:<id>" for a Recipe. */
export function scopeOf(source: CookSource): string {
  return source.kind === 'meal' ? `meal:${source.date}/${source.mealSlotId}` : `recipe:${source.recipeId}`
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
  if (params.date !== undefined && params.slotId !== undefined) {
    return { kind: 'meal', date: params.date, mealSlotId: Number(params.slotId) }
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
  /** null for the two-part form (the main Course until C3). */
  courseId: number | null
}

const MEAL_SCOPE = /^meal:(\d{4}-\d{2}-\d{2})\/(\d+)(?:\/(\d+))?$/

/** Reads "meal:<date>/<slotId>" and "meal:<date>/<slotId>/<courseId>"; null for a recipe scope, a free timer (null) or anything else. */
export function parseMealScope(scope: string | null | undefined): MealScopeParts | null {
  if (!scope) return null
  const m = MEAL_SCOPE.exec(scope)
  if (!m) return null
  return { date: m[1]!, mealSlotId: Number(m[2]), courseId: m[3] === undefined ? null : Number(m[3]) }
}

/**
 * THE ONE place cook scopes are compared (crs-plan 2.2, shim 2). Two meal scopes are the same when date, slot and Course
 * match, where the two-part form reads as the main Course: `sameScope('meal:d/3', 'meal:d/3/7', 7)` is true. It works
 * before C3 (the server writes the main Course two-part) and after (always three-part). While `mainCourseId` is unknown
 * (null or undefined) a two-part scope equals only itself. Recipe scopes and null compare as plain strings (null is
 * never equal to a scope).
 */
export function sameScope(a: string | null | undefined, b: string | null | undefined, mainCourseId?: number | null): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false
  const pa = parseMealScope(a)
  const pb = parseMealScope(b)
  if (!pa || !pb) return a === b
  if (pa.date !== pb.date || pa.mealSlotId !== pb.mealSlotId) return false
  if (pa.courseId === null && pb.courseId === null) return true
  const ca = pa.courseId ?? mainCourseId
  const cb = pb.courseId ?? mainCourseId
  if (ca === null || ca === undefined || cb === null || cb === undefined) return false
  return ca === cb
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

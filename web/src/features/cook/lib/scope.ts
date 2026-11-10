// The scope string of a cook session, as the server names it, and how a route opens one. Plain TypeScript.
import type { CookSource } from '../types'

/** "meal:<date>/<mealSlotId>" for a Planned Meal, "recipe:<id>" for a Recipe. */
export function scopeOf(source: CookSource): string {
  return source.kind === 'meal' ? `meal:${source.date}/${source.mealSlotId}` : `recipe:${source.recipeId}`
}

/** The route params Cook Mode opens with: a Planned Meal (date + slot) or a Recipe (id). */
export interface CookRouteParams {
  date?: string
  slotId?: string
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
  void recipeId
  void batches
  return ''
}

/** The route that opens Cook Mode for a Planned Meal: `/cook/meal/<YYYY-MM-DD>/<mealSlotId>`. */
export function cookMealPath(date: string, mealSlotId: number): string {
  void date
  void mealSlotId
  return ''
}

/** Where Exit goes: a Recipe session leaves to `/recipes/<id>`, a Planned Meal session to Today (`/`). */
export function exitPathFor(source: CookSource): string {
  void source
  return ''
}

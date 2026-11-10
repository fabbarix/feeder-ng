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

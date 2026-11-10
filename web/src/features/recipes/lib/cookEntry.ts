// The Cook / Batch entry of Recipe detail (QA B2, G2): how many Batches, and where Cook Mode opens. Plain TypeScript.

export const MIN_BATCHES = 1
export const MAX_BATCHES = 10

/** A whole number of Batches between MIN_BATCHES and MAX_BATCHES; anything else (NaN, fractions) rounds into range, NaN is 1. */
export function clampBatches(n: number): number {
  void n
  throw new Error('not implemented')
}

/** The Cook Mode route of a Recipe: /cook/recipe/:id?batches=N (the cook feature's scope.ts reads it). */
export function cookPath(recipeId: number, batches: number): string {
  void recipeId
  void batches
  throw new Error('not implemented')
}

/** Portions of `batches` Batches of a Recipe with Yield `yieldValue`, as text without trailing zeros ("8", "7.5"). */
export function batchPortions(yieldValue: number, batches: number): string {
  void yieldValue
  void batches
  throw new Error('not implemented')
}

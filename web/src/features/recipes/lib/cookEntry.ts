// The Cook / Batch entry of Recipe detail (QA B2, G2): the Batch bounds and the portions text. Plain TypeScript.

export const MIN_BATCHES = 1
export const MAX_BATCHES = 10

/** Portions of `batches` Batches of a Recipe with Yield `yieldValue`, as text without trailing zeros ("8", "7.5"). */
export function batchPortions(yieldValue: number, batches: number): string {
  return String(Number((yieldValue * batches).toFixed(2)))
}

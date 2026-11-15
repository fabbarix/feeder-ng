import type { ReadySection } from '../lib/ingredients'

export interface GetReadySource {
  courseId?: number
  courseName?: string
  recipeId: number
  recipeName: string
  batches: number
}

export interface GetReady {
  /** The Recipes (and lots, places) are still loading: Cook Mode waits, it does not flash Step 1 first. */
  isLoading: boolean
  /** There is a list to show: false when a Recipe could not be read or no line came back (Cook Mode then opens on Step 1, as before). */
  available: boolean
  sections: ReadySection[]
  /** lib/ingredients readyMeta of the first Recipe's Yield and Batches. */
  meta: string
  /** "Roast chicken · 2.75 portions" (a Recipe cook: "Roast chicken · 8 portions"), the sheet's context line. */
  context: string
}

/**
 * B9-45 (PC-05) STUB. Reads each Recipe (`GET /api/recipes/:id`), the Stock Lots (`GET /api/stock/lots`) and the Storage Places (`GET /api/storage-places`),
 * and builds the Get ready list (lib/ingredients). `portions` is the Planned Meal's (null for a Recipe cook). A Stock or places failure leaves the
 * rows without a place; a Recipe failure makes it unavailable.
 */
export function useGetReady(_sources: GetReadySource[], _portions: number | null): GetReady {
  throw new Error('B9-45: not built yet')
}

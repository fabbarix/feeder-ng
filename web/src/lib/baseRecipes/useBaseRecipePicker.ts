import type { PickerRows } from './types'

export interface UseBaseRecipePicker {
  query: string
  setQuery: (q: string) => void
  /** lib/baseRecipes/pickerRows of what was fetched, the query and the blocked set. */
  rows: PickerRows
  isLoading: boolean
  /** Words for a failed load, or null. */
  error: string | null
}

/**
 * Data for the BaseRecipePicker. Fetches `GET /api/recipes?kind=base` and `GET /api/recipes` (the plannable Recipes). With `recipeId`, the Recipe being edited:
 * it is left out (selfId) and every Recipe that calls for it, directly or through other Base recipes (`GET /api/recipes/{id}` -> `usedBy`, followed down),
 * is blocked with "<name> already calls for this Recipe". A new Recipe (no recipeId) blocks nothing. Logic in pickerRows; this only fetches and holds the query.
 */
export function useBaseRecipePicker(opts: { recipeId?: number; lineName: string }): UseBaseRecipePicker {
  void opts
  throw new Error('BR-D: not implemented')
}

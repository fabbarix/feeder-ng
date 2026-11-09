import type { RecipeFilter, RecipeSummary, TagCount } from '../types'

export interface UseRecipes {
  recipes: RecipeSummary[]
  tags: TagCount[]
  /** True when there are no Recipes at all (not just no match). */
  isEmpty: boolean
  isLoading: boolean
  error: Error | null
}

/** react-query ['recipes', filter] and ['tags']. Live: the SPA invalidates on SSE topic `recipes`. */
export function useRecipes(_filter: RecipeFilter): UseRecipes {
  throw new Error('TODO')
}

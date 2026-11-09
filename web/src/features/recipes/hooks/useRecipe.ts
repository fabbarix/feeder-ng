import type { Recipe } from '../types'

export interface UseRecipe {
  recipe: Recipe | undefined
  isLoading: boolean
  error: Error | null
  /** Archive / unarchive; refreshes ['recipes'] and ['recipes', id]. */
  setArchived: (archived: boolean) => Promise<void>
  /** Hard delete. Rejects with ApiError code 'already_planned' when the Recipe was ever planned. */
  remove: () => Promise<void>
}

export function useRecipe(_id: number): UseRecipe {
  throw new Error('TODO')
}

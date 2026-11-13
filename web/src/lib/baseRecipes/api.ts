import type { Recipe } from '../../features/recipes/types'
import type { LinkCandidate, LinkResult, ToBasePlan } from './types'

// BR-D: the Base recipe routes (docs/dev/design/base-recipes.md §10; shapes pinned by internal/recipe/httpapi/base_test.go).

export const baseRecipesApi = {
  /** POST /api/recipes/{id}/to-base?dryRun=1: what the conversion takes away. */
  toBasePlan: (id: number): Promise<ToBasePlan> => {
    void id
    throw new Error('BR-D: not implemented')
  },
  /** POST /api/recipes/{id}/to-base { yield, yieldUnit }. */
  toBase: (id: number, body: { yield: number; yieldUnit: string }): Promise<Recipe> => {
    void id; void body
    throw new Error('BR-D: not implemented')
  },
  /** POST /api/recipes/{id}/to-plannable { yield }. */
  toPlannable: (id: number, body: { yield: number }): Promise<Recipe> => {
    void id; void body
    throw new Error('BR-D: not implemented')
  },
  /** POST /api/recipes/{id}/lines/{lineId}/base { baseRecipeId }: the whole Recipe back. */
  linkLine: (recipeId: number, lineId: number, baseRecipeId: number): Promise<Recipe> => {
    void recipeId; void lineId; void baseRecipeId
    throw new Error('BR-D: not implemented')
  },
  /** DELETE /api/recipes/{id}/lines/{lineId}/base: back to the Ingredient it was linked from. */
  unlinkLine: (recipeId: number, lineId: number): Promise<Recipe> => {
    void recipeId; void lineId
    throw new Error('BR-D: not implemented')
  },
  /** GET /api/recipes/{id}/link-candidates -> lines. */
  linkCandidates: (baseRecipeId: number): Promise<LinkCandidate[]> => {
    void baseRecipeId
    throw new Error('BR-D: not implemented')
  },
  /** POST /api/recipes/{id}/link { lineIds } (all or nothing). */
  link: (baseRecipeId: number, lineIds: number[]): Promise<LinkResult> => {
    void baseRecipeId; void lineIds
    throw new Error('BR-D: not implemented')
  },
  /** POST /api/recipes/{id}/unlink { lineIds }: the bulk Undo. */
  unlink: (baseRecipeId: number, lineIds: number[]): Promise<void> => {
    void baseRecipeId; void lineIds
    throw new Error('BR-D: not implemented')
  },
}

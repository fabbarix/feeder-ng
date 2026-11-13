import { http } from '../http'
import type { Recipe, RecipeInput } from '../../features/recipes/types'
import type { LinkCandidatesAnswer, LinkResult, PickerBaseRecipe, PickerPlannable, ToBasePlan } from './types'

// BR-D: the Base recipe routes (docs/dev/design/base-recipes.md §10; shapes pinned by internal/recipe/httpapi/base_test.go).

export const baseRecipesApi = {
  /** GET /api/recipes?kind=base (with `for`: &for={id}, each row's wouldCycle for that Recipe being edited): the Base recipes for the picker. */
  pickerBaseRecipes: (forRecipeId?: number) =>
    http.get<PickerBaseRecipe[]>(forRecipeId === undefined ? '/api/recipes?kind=base' : `/api/recipes?kind=base&for=${forRecipeId}`),
  /** GET /api/recipes: the plannable Recipes for the picker's second group. */
  pickerPlannable: () => http.get<PickerPlannable[]>('/api/recipes'),
  /** POST /api/recipes: a new Base recipe (takeOver answers the take-over ask). */
  createBase: (body: RecipeInput) => http.post<Recipe>('/api/recipes', body),
  /** PUT /api/ingredients/{id}/conversions/{unit} { toBase }: the inline Unit Conversion. */
  saveConversion: (ingredientId: number, unit: string, toBase: number) =>
    http.put<void>(`/api/ingredients/${ingredientId}/conversions/${encodeURIComponent(unit)}`, { toBase }),
  /** GET /api/ingredients/{id}/merge-preview?into=: blocked and conflicts. */
  mergePreview: (id: number, into: number) =>
    http.get<{ blocked: string; conflicts: unknown[] }>(`/api/ingredients/${id}/merge-preview?into=${into}`),
  /** POST /api/ingredients/{id}/merge { into }. */
  mergeInto: (id: number, into: number) => http.post<unknown>(`/api/ingredients/${id}/merge`, { into }),
  /** POST /api/recipes/{id}/to-base?dryRun=1: what the conversion takes away. */
  toBasePlan: (id: number): Promise<ToBasePlan> => http.post<ToBasePlan>(`/api/recipes/${id}/to-base?dryRun=1`),
  /** POST /api/recipes/{id}/to-base { yield, yieldUnit, takeOver? }: takeOver answers the take-over ask (409 base_recipe_take_over). */
  toBase: (id: number, body: { yield: number; yieldUnit: string; takeOver?: boolean }): Promise<Recipe> => http.post<Recipe>(`/api/recipes/${id}/to-base`, body),
  /** POST /api/recipes/{id}/to-plannable { yield }. */
  toPlannable: (id: number, body: { yield: number }): Promise<Recipe> => http.post<Recipe>(`/api/recipes/${id}/to-plannable`, body),
  /** POST /api/recipes/{id}/lines/{lineId}/base { baseRecipeId }: the whole Recipe back. */
  linkLine: (recipeId: number, lineId: number, baseRecipeId: number): Promise<Recipe> =>
    http.post<Recipe>(`/api/recipes/${recipeId}/lines/${lineId}/base`, { baseRecipeId }),
  /** DELETE /api/recipes/{id}/lines/{lineId}/base: back to the Ingredient it was linked from. */
  unlinkLine: (recipeId: number, lineId: number, ingredientId?: number): Promise<Recipe> =>
    ingredientId === undefined
      ? http.delete<Recipe>(`/api/recipes/${recipeId}/lines/${lineId}/base`)
      : http.deleteJson<Recipe>(`/api/recipes/${recipeId}/lines/${lineId}/base`, { ingredientId }),
  /** GET /api/recipes/{id}/link-candidates -> { baseUnit, lines }. */
  linkCandidates: (baseRecipeId: number): Promise<LinkCandidatesAnswer> => http.get<LinkCandidatesAnswer>(`/api/recipes/${baseRecipeId}/link-candidates`),
  /** POST /api/recipes/{id}/link { lineIds } (all or nothing). */
  link: (baseRecipeId: number, lineIds: number[]): Promise<LinkResult> => http.post<LinkResult>(`/api/recipes/${baseRecipeId}/link`, { lineIds }),
  /** POST /api/recipes/{id}/unlink { lineIds }: the bulk Undo. */
  unlink: (baseRecipeId: number, lineIds: number[]): Promise<void> => http.post<void>(`/api/recipes/${baseRecipeId}/unlink`, { lineIds }),
}

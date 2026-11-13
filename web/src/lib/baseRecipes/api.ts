import { http } from '../http'
import type { Recipe, RecipeInput } from '../../features/recipes/types'
import type { LinkCandidate, LinkResult, PickerBaseRecipe, PickerPlannable, ToBasePlan } from './types'

// BR-D: the Base recipe routes (docs/dev/design/base-recipes.md §10; shapes pinned by internal/recipe/httpapi/base_test.go).

export const baseRecipesApi = {
  /** GET /api/recipes?kind=base: the Base recipes for the picker. */
  pickerBaseRecipes: () => http.get<PickerBaseRecipe[]>('/api/recipes?kind=base'),
  /** GET /api/recipes: the plannable Recipes for the picker's second group. */
  pickerPlannable: () => http.get<PickerPlannable[]>('/api/recipes'),
  /** GET /api/recipes/{id}: its usedBy (the Recipes that call for it). */
  usedBy: async (id: number): Promise<Array<{ id: number; name: string }>> =>
    (await http.get<{ usedBy?: Array<{ id: number; name: string }> }>(`/api/recipes/${id}`)).usedBy ?? [],
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
  /** POST /api/recipes/{id}/to-base { yield, yieldUnit }. */
  toBase: (id: number, body: { yield: number; yieldUnit: string }): Promise<Recipe> => http.post<Recipe>(`/api/recipes/${id}/to-base`, body),
  /** POST /api/recipes/{id}/to-plannable { yield }. */
  toPlannable: (id: number, body: { yield: number }): Promise<Recipe> => http.post<Recipe>(`/api/recipes/${id}/to-plannable`, body),
  /** POST /api/recipes/{id}/lines/{lineId}/base { baseRecipeId }: the whole Recipe back. */
  linkLine: (recipeId: number, lineId: number, baseRecipeId: number): Promise<Recipe> =>
    http.post<Recipe>(`/api/recipes/${recipeId}/lines/${lineId}/base`, { baseRecipeId }),
  /** DELETE /api/recipes/{id}/lines/{lineId}/base: back to the Ingredient it was linked from. */
  unlinkLine: (recipeId: number, lineId: number): Promise<Recipe> => http.delete<Recipe>(`/api/recipes/${recipeId}/lines/${lineId}/base`),
  /** GET /api/recipes/{id}/link-candidates -> lines. */
  linkCandidates: async (baseRecipeId: number): Promise<LinkCandidate[]> => (await http.get<{ lines: LinkCandidate[] }>(`/api/recipes/${baseRecipeId}/link-candidates`)).lines,
  /** POST /api/recipes/{id}/link { lineIds } (all or nothing). */
  link: (baseRecipeId: number, lineIds: number[]): Promise<LinkResult> => http.post<LinkResult>(`/api/recipes/${baseRecipeId}/link`, { lineIds }),
  /** POST /api/recipes/{id}/unlink { lineIds }: the bulk Undo. */
  unlink: (baseRecipeId: number, lineIds: number[]): Promise<void> => http.post<void>(`/api/recipes/${baseRecipeId}/unlink`, { lineIds }),
}

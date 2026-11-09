import { http } from '../../lib/http'
import type {
  IngredientRef,
  MemberPreferences,
  PreferenceState,
  Recipe,
  RecipeFilter,
  RecipeInput,
  RecipeSummary,
  TagCount,
  UploadedImage,
} from './types'

// STUB: signatures only. Routes are listed in docs/dev/design/t8-recipes.md.
export const recipesApi = {
  list: (_f: RecipeFilter): Promise<RecipeSummary[]> => notYet(),
  get: (_id: number): Promise<Recipe> => notYet(),
  create: (_body: RecipeInput): Promise<Recipe> => notYet(),
  replace: (_id: number, _body: RecipeInput): Promise<Recipe> => notYet(),
  archive: (_id: number): Promise<Recipe> => notYet(),
  unarchive: (_id: number): Promise<Recipe> => notYet(),
  remove: (_id: number): Promise<void> => notYet(),
  tags: (): Promise<TagCount[]> => notYet(),
  uploadImage: (_file: File): Promise<UploadedImage> => notYet(),
  /** GET /api/ingredients/search (ingredients feature). */
  findIngredients: (_q: string): Promise<IngredientRef[]> => notYet(),
  /** PUT /api/ingredients/{id}/conversions/{unit} (ingredients feature). */
  saveConversion: (_ingredientId: number, _unit: string, _toBase: number): Promise<void> => notYet(),
  preferences: (_memberId?: number): Promise<MemberPreferences> => notYet(),
  setRecipeState: (_recipeId: number, _state: PreferenceState, _memberId?: number): Promise<void> => notYet(),
  setIngredientExclusion: (_ingredientId: number, _excluded: boolean, _memberId?: number): Promise<void> => notYet(),
}

function notYet<T>(): Promise<T> {
  void http
  throw new Error('TODO')
}

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

const base = '/api/recipes'

function listQuery(f: RecipeFilter): string {
  const params = new URLSearchParams()
  if (f.q) params.set('q', f.q)
  if (f.tag) params.set('tag', f.tag)
  if (f.archived) params.set('archived', f.archived)
  const s = params.toString()
  return s ? `?${s}` : ''
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Recipes, Tags, images, Member preferences and the Ingredient calls the editor needs (routes in docs/dev/design/t8-recipes.md). */
export const recipesApi = {
  list: (f: RecipeFilter) => http.get<RecipeSummary[]>(`${base}${listQuery(f)}`),
  get: (id: number) => http.get<Recipe>(`${base}/${id}`),
  create: (body: RecipeInput) => http.post<Recipe>(base, body),
  replace: (id: number, body: RecipeInput) => http.put<Recipe>(`${base}/${id}`, body),
  archive: (id: number) => http.post<Recipe>(`${base}/${id}/archive`),
  unarchive: (id: number) => http.post<Recipe>(`${base}/${id}/unarchive`),
  remove: (id: number) => http.delete<void>(`${base}/${id}`),
  tags: () => http.get<TagCount[]>('/api/tags'),
  /** Sends the photo as a JSON data URL (the server refuses multipart bodies). */
  uploadImage: async (file: File) => http.post<UploadedImage>('/api/images', { dataUrl: await readDataUrl(file) }),
  /** All Ingredients, with their Base Units and Unit Conversions (for unit pickers and quantities). */
  ingredients: () => http.get<IngredientRef[]>('/api/ingredients'),
  saveConversion: async (ingredientId: number, unit: string, toBase: number): Promise<void> => {
    await http.put(`/api/ingredients/${ingredientId}/conversions/${encodeURIComponent(unit)}`, { toBase })
  },
  preferences: (memberId?: number) =>
    http.get<MemberPreferences>(memberId === undefined ? '/api/recipe-preferences' : `/api/recipe-preferences?memberId=${memberId}`),
  setRecipeState: (recipeId: number, state: PreferenceState, memberId?: number) =>
    http.put<MemberPreferences>(`${base}/${recipeId}/preference`, { state, memberId }),
  setIngredientExclusion: (ingredientId: number, excluded: boolean, memberId?: number) =>
    http.put<MemberPreferences>(`/api/ingredient-exclusions/${ingredientId}`, { excluded, memberId }),
}

import { http } from '../../lib/http'
import type {
  Conversion,
  Ingredient,
  IngredientDetail,
  IngredientPatch,
  MergePreview,
  MergeRequest,
  NewIngredient,
  SearchResult,
} from './types'

const base = '/api/ingredients'

export const ingredientsApi = {
  list: (q?: string) => http.get<Ingredient[]>(q ? `${base}?q=${encodeURIComponent(q)}` : base),
  search: (q: string, limit?: number) =>
    http.get<SearchResult>(`${base}/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`),
  get: (id: number) => http.get<IngredientDetail>(`${base}/${id}`),
  create: (body: NewIngredient) => http.post<Ingredient>(base, body),
  patch: (id: number, body: IngredientPatch) => http.patch<Ingredient>(`${base}/${id}`, body),
  remove: (id: number) => http.delete<void>(`${base}/${id}`),
  setConversion: (id: number, c: Conversion) =>
    http.put<Ingredient>(`${base}/${id}/conversions/${encodeURIComponent(c.unit)}`, { toBase: c.toBase }),
  removeConversion: (id: number, unit: string) =>
    http.delete<Ingredient>(`${base}/${id}/conversions/${encodeURIComponent(unit)}`),
  mergePreview: (id: number, into: number) => http.get<MergePreview>(`${base}/${id}/merge-preview?into=${into}`),
  merge: (id: number, body: MergeRequest) => http.post<Ingredient>(`${base}/${id}/merge`, body),
}

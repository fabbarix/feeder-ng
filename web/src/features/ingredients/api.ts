import { http } from '../../lib/http'
import type {
  Conversion,
  Ingredient,
  IngredientKind,
  IngredientDetail,
  IngredientPatch,
  MergePreview,
  MergeRequest,
  NewIngredient,
  SearchResult,
} from './types'

const base = '/api/ingredients'

/** The query string of the given parameters (undefined and '' are left out); `joined` = already has a query, so it starts with '&'. */
function query(params: Array<[string, string | undefined]>, joined = false): string {
  const parts = params.flatMap(([k, v]) => (v === undefined || v === '' ? [] : [`${k}=${encodeURIComponent(v)}`]))
  if (parts.length === 0) return ''
  return joined ? `&${parts.join('&')}` : `?${parts.join('&')}`
}

export const ingredientsApi = {
  list: (q?: string, kind?: IngredientKind) => http.get<Ingredient[]>(`${base}${query([['q', q], ['kind', kind]])}`),
  search: (q: string, limit?: number, kind?: IngredientKind) =>
    http.get<SearchResult>(`${base}/search?q=${encodeURIComponent(q)}${query([['limit', limit ? String(limit) : undefined], ['kind', kind]], true)}`),
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

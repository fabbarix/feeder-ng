import { http } from '../../lib/http'
import type { AssistantStatus, ConfirmPhoto, DecisionsWire, ExportableRecipe, ImportResult, ReadBody, ReadStarted, ReadView, ReviewResponse } from './types'
import type { CallGraph } from './lib/exportAlso'


/** Recipe File calls (routes in docs/dev/design/t12-import-export.md). */
export const importApi = {
  /** Opens an Import Review from the file's text. Rejects with ApiError (invalid_recipe_file, unsupported_version, invalid_json, file_too_large). */
  open: (text: string) => http.post<ReviewResponse>('/api/imports', { text }),
  /** Recomputes the Import Review for the answers so far. */
  plan: (id: string, decisions: DecisionsWire) => http.post<ReviewResponse>(`/api/imports/${encodeURIComponent(id)}/plan`, { decisions }),
  /** Saves everything. Rejects with import_not_ready (422, details.plan) or import_stale (409). */
  confirm: (id: string, decisions: DecisionsWire, photo?: ConfirmPhoto) =>
    http.post<ImportResult>(`/api/imports/${encodeURIComponent(id)}/confirm`, photo ? { decisions, photo } : { decisions }),
  discard: (id: string) => http.delete<void>(`/api/imports/${encodeURIComponent(id)}`),
  /** The Agent Prompt text. */
  agentPrompt: async (): Promise<string> => (await http.get<{ prompt: string }>('/api/recipe-file/agent-prompt')).prompt,
  /** Recipes to pick from, archived ones included. */
  recipes: () => http.get<ExportableRecipe[]>('/api/recipes?archived=all'),
  /** BR-E round 2: the Base recipe Ingredient of a Recipe (GET /api/recipes/{id}.baseIngredientId), for the bulk link sheet; null when it has none. */
  baseIngredientOf: async (id: number): Promise<number | null> => {
    const detail = await http.get<{ baseIngredientId?: number | null }>(`/api/recipes/${id}`)
    return detail.baseIngredientId ?? null
  },
  /** BR-E: the Base recipes a Recipe calls for on its lines (GET /api/recipes/{id}, its `lines[].baseRecipe`): the Export picker's "Also exports". */
  recipeCalls: async (id: number): Promise<CallGraph[number]> => {
    const detail = await http.get<{ name: string; lines: Array<{ baseRecipe: { id: number; name: string } | null }> }>(`/api/recipes/${id}`)
    return {
      name: detail.name,
      calls: detail.lines.flatMap((l) => (l.baseRecipe ? [{ id: l.baseRecipe.id, name: l.baseRecipe.name }] : [])),
    }
  },

  // ---- Recipe Assistant reads (WP-E / WP-G) ----
  /** GET /api/recipe-assistant/status. */
  assistantStatus: () => http.get<AssistantStatus>('/api/recipe-assistant/status'),
  /** POST /api/recipe-assistant/reads. 202 {id, state}; rejects with ApiError (see lib/readErrors for the codes). The body keeps `photos` as its first key. */
  startRead: (body: ReadBody) => http.post<ReadStarted>('/api/recipe-assistant/reads', body),
  /** GET /api/recipe-assistant/reads/{id}. 404 = lost (expired or restarted). */
  getRead: (id: string, opts?: { signal?: AbortSignal }) => http.get<ReadView>(`/api/recipe-assistant/reads/${encodeURIComponent(id)}`, opts),
  /** DELETE /api/recipe-assistant/reads/{id}: 204, cancels a running read. */
  cancelRead: (id: string, opts?: { keepalive?: boolean }) => http.delete<void>(`/api/recipe-assistant/reads/${encodeURIComponent(id)}`, opts),
}

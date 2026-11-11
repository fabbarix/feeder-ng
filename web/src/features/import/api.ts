import { http } from '../../lib/http'
import type { AssistantStatus, ConfirmPhoto, Decisions, ExportableRecipe, ImportResult, ReadBody, ReadStarted, ReadView, ReviewResponse } from './types'

/** Recipe File calls (routes in docs/dev/design/t12-import-export.md). */
export const importApi = {
  /** Opens an Import Review from the file's text. Rejects with ApiError (invalid_recipe_file, unsupported_version, invalid_json, file_too_large). */
  open: (text: string) => http.post<ReviewResponse>('/api/imports', { text }),
  /** Recomputes the Import Review for the answers so far. */
  plan: (id: string, decisions: Decisions) => http.post<ReviewResponse>(`/api/imports/${encodeURIComponent(id)}/plan`, { decisions }),
  /** Saves everything. Rejects with import_not_ready (422, details.plan) or import_stale (409). */
  confirm: (id: string, decisions: Decisions, photo?: ConfirmPhoto) => {
    void photo // TODO(ra-e developer): send `photo` only when given (422 validation_failed, field `photo`, for a bad choice)
    return http.post<ImportResult>(`/api/imports/${encodeURIComponent(id)}/confirm`, { decisions })
  },
  discard: (id: string) => http.delete<void>(`/api/imports/${encodeURIComponent(id)}`),
  /** The Agent Prompt text. */
  agentPrompt: async (): Promise<string> => (await http.get<{ prompt: string }>('/api/recipe-file/agent-prompt')).prompt,
  /** Recipes to pick from, archived ones included. */
  recipes: () => http.get<ExportableRecipe[]>('/api/recipes?archived=all'),

  // ---- Recipe Assistant reads (WP-E / WP-G) ----
  /** GET /api/recipe-assistant/status. */
  assistantStatus: (): Promise<AssistantStatus> => notImplemented(),
  /** POST /api/recipe-assistant/reads. 202 {id, state}; rejects with ApiError (see lib/readErrors for the codes). */
  startRead: (body: ReadBody): Promise<ReadStarted> => notImplemented(body),
  /** GET /api/recipe-assistant/reads/{id}. 404 = lost (expired or restarted). */
  getRead: (id: string, opts?: { signal?: AbortSignal }): Promise<ReadView> => notImplemented(id, opts),
  /** DELETE /api/recipe-assistant/reads/{id}: 204, cancels a running read. */
  cancelRead: (id: string): Promise<void> => notImplemented(id),
}

function notImplemented(...args: unknown[]): never {
  void args
  throw new Error('TODO(ra-e developer): not implemented')
}

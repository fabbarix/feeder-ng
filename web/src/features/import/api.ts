import { http } from '../../lib/http'
import type { Decisions, ExportableRecipe, ImportResult, ReviewResponse } from './types'

/** Recipe File calls (routes in docs/dev/design/t12-import-export.md). */
export const importApi = {
  /** Opens an Import Review from the file's text. Rejects with ApiError (invalid_recipe_file, unsupported_version, invalid_json, file_too_large). */
  open: (text: string) => http.post<ReviewResponse>('/api/imports', { text }),
  /** Recomputes the Import Review for the answers so far. */
  plan: (id: string, decisions: Decisions) => http.post<ReviewResponse>(`/api/imports/${encodeURIComponent(id)}/plan`, { decisions }),
  /** Saves everything. Rejects with import_not_ready (422, details.plan) or import_stale (409). */
  confirm: (id: string, decisions: Decisions) => http.post<ImportResult>(`/api/imports/${encodeURIComponent(id)}/confirm`, { decisions }),
  discard: (id: string) => http.delete<void>(`/api/imports/${encodeURIComponent(id)}`),
  /** The Agent Prompt text. */
  agentPrompt: async (): Promise<string> => (await http.get<{ prompt: string }>('/api/recipe-file/agent-prompt')).prompt,
  /** Recipes to pick from, archived ones included. */
  recipes: () => http.get<ExportableRecipe[]>('/api/recipes?archived=all'),
}

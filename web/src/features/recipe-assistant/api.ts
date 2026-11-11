// Typed calls for the Recipe Assistant settings endpoints (docs/dev/design/ai-recipe-import.md section 7).
import { http } from '../../lib/http'
import type { AssistantSettings, ModelsRequest, ModelsResponse, SettingsPutBody, SettingsWarning, TestRequest, TestResult } from './types'

const BASE = '/api/recipe-assistant'

/** The PUT answer is the settings plus the warnings of a successful save. */
export type SettingsAnswer = AssistantSettings & { warnings?: SettingsWarning[] }

export const recipeAssistantApi = {
  getSettings: () => http.get<AssistantSettings>(`${BASE}/settings`),
  saveSettings: (body: SettingsPutBody) => http.put<SettingsAnswer>(`${BASE}/settings`, body),
  removeKey: () => http.delete<AssistantSettings>(`${BASE}/settings/api-key`),
  listModels: (body: ModelsRequest) => http.post<ModelsResponse>(`${BASE}/models`, body),
  testConnection: (body: TestRequest) => http.post<TestResult>(`${BASE}/test`, body),
}

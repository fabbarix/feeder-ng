// Wire types for the Recipe Assistant settings API (docs/dev/design/ai-recipe-import.md section 7, frozen).
// Type-only: no runtime code. The settings response never has an API key, only hasApiKey / apiKeyLast4 / apiKeyReadable.

export type ModelStatus = 'ok' | 'deprecated' | 'unavailable' | 'unknown'
export type ChangeAction = 'turned_on' | 'turned_off' | 'base_url_changed' | 'model_changed' | 'key_saved' | 'key_replaced' | 'key_removed'

export interface SettingsChange {
  at: string
  actorName: string
  action: ChangeAction
  detail: string
}

export interface AssistantSettings {
  secretKeyConfigured: boolean
  enabled: boolean
  baseUrl: string
  defaultBaseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyLast4: string
  apiKeyReadable: boolean
  modelStatus: ModelStatus
  retiresAt?: string
  changes: SettingsChange[]
}

export type SettingsWarningCode = 'not_verified' | 'no_photos'
export interface SettingsWarning {
  code: SettingsWarningCode
}
export type SaveResult = { settings: AssistantSettings; warnings: SettingsWarning[] }

/** PUT body. `apiKey` is OMITTED (not '' or null) unless the Admin typed one. */
export interface SettingsPutBody {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey?: string
}

export interface ModelInfo {
  id: string
  name: string
  description: string
  /** '$' | '$$' | '$$$' | '$$$$', or '' when the catalogue doesn't know the model. */
  priceTier: string
  /** 'Fastest' | 'Quick' | 'Steady' | 'Slow', or ''. */
  speedTier: string
  /** 'Recommended' | 'Other models' | 'Older models' (API order within a group is kept). */
  group: string
  lifecycle: 'active' | 'deprecated' | 'retired'
  retiresAt?: string
  imageInput?: boolean
}
export interface ModelsRequest {
  baseUrl?: string
  apiKey?: string
  refresh?: boolean
}
export interface ModelsResponse {
  models: ModelInfo[]
  source: 'api' | 'catalogue'
  notice?: string
}

export interface TestRequest {
  baseUrl?: string
  model?: string
  apiKey?: string
}
export interface TestCheck {
  name: 'key' | 'model' | 'output'
  ok: boolean
  code?: string
}
export interface TestResult {
  ok: boolean
  checks: TestCheck[]
  model?: { id: string; name: string }
  latencyMs: number
}

/** The form fields an API validation error can name. */
export type FormField = 'enabled' | 'baseUrl' | 'model' | 'apiKey'
export interface FieldErrorCode {
  field: FormField
  code: string
}

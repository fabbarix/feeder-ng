// Fixtures for the Recipe Assistant settings tests (not scanned by the native-controls guard).
import type { AssistantSettings, ModelInfo, ModelsResponse } from './types'

export const SAVED_BASE_URL = 'https://api.anthropic.com'

export const settingsOn: AssistantSettings = {
  secretKeyConfigured: true,
  enabled: true,
  baseUrl: SAVED_BASE_URL,
  defaultBaseUrl: SAVED_BASE_URL,
  model: 'claude-haiku-5-5',
  hasApiKey: true,
  apiKeyLast4: '1234',
  apiKeyReadable: true,
  modelStatus: 'ok',
  changes: [
    { at: '2026-11-10T10:00:00Z', actorName: 'Anna', action: 'model_changed', detail: 'Claude Sonnet 5.5' },
    { at: '2026-11-09T09:00:00Z', actorName: 'Anna', action: 'turned_on', detail: '' },
  ],
}
export const settingsOffNoKey: AssistantSettings = { ...settingsOn, enabled: false, hasApiKey: false, apiKeyLast4: '', changes: [] }
export const settingsNoSecretKey: AssistantSettings = { ...settingsOffNoKey, secretKeyConfigured: false }
export const settingsKeyUnreadable: AssistantSettings = { ...settingsOn, apiKeyReadable: false }
export const settingsRetiredModel: AssistantSettings = { ...settingsOn, model: 'claude-sonnet-4-5', modelStatus: 'unavailable' }

const m = (id: string, name: string, group: string, priceTier: string, speedTier: string, description: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({
  id, name, group, priceTier, speedTier, description, lifecycle: 'active', imageInput: true, ...extra,
})
export const models: ModelInfo[] = [
  m('claude-haiku-5-5', 'Claude Haiku 5.5', 'Recommended', '$', 'Fastest', 'Fastest and cheapest. Default. May need more fixing in Import Review.'),
  m('claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Recommended', '$$', 'Quick', 'Better with messy pages and handwriting.'),
  m('claude-opus-5-5', 'Claude Opus 5.5', 'Recommended', '$$$', 'Steady', 'Most careful with estimates and hard handwriting.'),
  m('claude-fable-5-1', 'Claude Fable 5.1', 'Other models', '$$$$', 'Slow', 'Most capable; far more than recipes need.'),
  m('claude-opus-4-8', 'Claude Opus 4.8', 'Older models', '$$$', '', 'Previous generation.', { lifecycle: 'deprecated', retiresAt: '2027-03-12' }),
]
export const modelsApi: ModelsResponse = { models, source: 'api' }
export const modelsCatalogue: ModelsResponse = { models, source: 'catalogue', notice: "Couldn't reach the model list. Showing the usual models." }

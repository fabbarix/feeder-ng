// The Settings form as a pure state machine: form <-> API body, "an empty key is omitted", "a new origin needs the key typed".
import { raStrings } from '../strings'
import type { AssistantSettings, ModelsRequest, SettingsPutBody, TestRequest } from '../types'
import { sameOrigin, validateBaseUrl } from './baseUrl'
import { isValidModelId } from './modelOptions'

export interface SettingsForm {
  enabled: boolean
  baseUrl: string
  model: string
  /** What the Admin typed; empty keeps the saved key. Never sent as an empty string, never stored anywhere. */
  apiKey: string
  /** Replace was pressed: the key field shows instead of the saved row. */
  replacing: boolean
}

export interface KeyRowState {
  mode: 'saved' | 'entry'
  canKeepSaved: boolean
  required: boolean
  unreadable: boolean
}

export interface FormErrors {
  baseUrl?: string
  model?: string
  apiKey?: string
}

const typedKey = (form: SettingsForm) => (form.apiKey ?? '').trim()
const normalUrl = (text: string) => text.trim().replace(/\/+$/, '')
const hasReadableKey = (saved: AssistantSettings) => saved.hasApiKey && saved.apiKeyReadable

export const formFromSettings = (s: AssistantSettings): SettingsForm => ({ enabled: s.enabled, baseUrl: s.baseUrl, model: s.model, apiKey: '', replacing: false })
export const withBaseUrl = (form: SettingsForm, baseUrl: string): SettingsForm => ({ ...form, baseUrl })
export const withReplacing = (form: SettingsForm, replacing: boolean): SettingsForm => ({ ...form, replacing })

/** The address is not the saved origin (or cannot be parsed): the saved key does not apply to it. */
export const originChanged = (form: SettingsForm, saved: AssistantSettings): boolean => !sameOrigin(saved.baseUrl, form.baseUrl)

export function keyRowState(form: SettingsForm, saved: AssistantSettings): KeyRowState {
  if (!hasReadableKey(saved)) return { mode: 'entry', canKeepSaved: false, required: false, unreadable: saved.hasApiKey }
  if (originChanged(form, saved)) return { mode: 'entry', canKeepSaved: false, required: true, unreadable: false }
  if (form.replacing) return { mode: 'entry', canKeepSaved: true, required: false, unreadable: false }
  return { mode: 'saved', canKeepSaved: false, required: false, unreadable: false }
}

/** The PUT body. `apiKey` is omitted unless something was typed; the saved key is never known to the client. */
export function toPutBody(form: SettingsForm, _saved?: AssistantSettings): SettingsPutBody {
  const body: SettingsPutBody = { enabled: form.enabled, baseUrl: form.baseUrl.trim(), model: form.model.trim() }
  const key = typedKey(form)
  if (key !== '') body.apiKey = key
  return body
}

export function isDirty(form: SettingsForm, saved: AssistantSettings): boolean {
  return (
    form.enabled !== saved.enabled ||
    normalUrl(form.baseUrl) !== normalUrl(saved.baseUrl) ||
    form.model.trim() !== saved.model ||
    typedKey(form) !== ''
  )
}

/** API codes per field. The caller shows the base URL one live, the others after Save is pressed. */
export function validateForm(form: SettingsForm, saved: AssistantSettings): FormErrors {
  const errors: FormErrors = {}
  const baseUrl = validateBaseUrl(form.baseUrl)
  if (baseUrl) errors.baseUrl = baseUrl
  const model = form.model.trim()
  if (model === '') errors.model = 'model_required'
  else if (!isValidModelId(model)) errors.model = 'model_id_invalid'
  if (typedKey(form) === '') {
    if (saved.hasApiKey && originChanged(form, saved)) errors.apiKey = 'key_required_for_new_base_url'
    else if (form.enabled && !hasReadableKey(saved)) errors.apiKey = 'api_key_required'
  }
  return errors
}

/** Refresh models and Test connection run with the unsaved values; they need a usable key for the typed address. */
export function canCallWithUnsavedValues(form: SettingsForm, saved: AssistantSettings): boolean {
  if (!saved.secretKeyConfigured || validateBaseUrl(form.baseUrl) !== null) return false
  return typedKey(form) !== '' || (hasReadableKey(saved) && !originChanged(form, saved))
}

/** Why those two are unavailable, in text (not only a disabled look); undefined when they are available. */
export function unavailableHint(form: SettingsForm, saved: AssistantSettings): string | undefined {
  if (canCallWithUnsavedValues(form, saved)) return undefined
  if (!saved.secretKeyConfigured) return raStrings.testHintNoSecretKey
  if (validateBaseUrl(form.baseUrl) !== null) return raStrings.testHintBadAddress
  return saved.hasApiKey && originChanged(form, saved) ? raStrings.testHintNewAddress : raStrings.testHintNeedsKey
}

/** The request for the model list: the address only when the text differs from the saved one, the key only when typed. */
export function modelsRequest(form: SettingsForm, saved: AssistantSettings): ModelsRequest {
  const req: ModelsRequest = {}
  if (form.baseUrl.trim() !== saved.baseUrl) req.baseUrl = form.baseUrl.trim()
  if (typedKey(form) !== '') req.apiKey = typedKey(form)
  return req
}

export function testRequest(form: SettingsForm, saved: AssistantSettings): TestRequest {
  return { ...modelsRequest(form, saved), model: form.model.trim() }
}

export interface Status {
  label: string
  status: 'success' | 'neutral' | 'warning'
}

/** The status Chip of the Recipe Assistant tile; the first match wins. */
export function statusOf(s: AssistantSettings): Status {
  const t = raStrings.status
  if (!s.secretKeyConfigured) return { label: t.needsSecretKey, status: 'warning' }
  if (!s.hasApiKey) return { label: t.needsKey, status: 'warning' }
  if (!s.apiKeyReadable) return { label: t.keyUnreadable, status: 'warning' }
  if (s.modelStatus === 'unavailable') return { label: t.modelUnavailable, status: 'warning' }
  return s.enabled ? { label: t.on, status: 'success' } : { label: t.off, status: 'neutral' }
}

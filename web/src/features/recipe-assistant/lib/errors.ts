// API error code -> copy. Plain TypeScript; the page shows these, never the server's message.
import { ApiError } from '../../../lib/http'
import { raStrings } from '../strings'
import type { FormField, TestCheck } from '../types'

const FIELD_COPY: Record<string, string> = {
  secret_key_missing: 'The server needs a secret key before the Recipe Assistant can be turned on or given a key.',
  base_url_invalid: 'Enter a full address, like https://api.anthropic.com.',
  base_url_not_https: 'Use https. Plain http is only for localhost.',
  base_url_has_version: 'Leave out /v1; Feeder adds it.',
  model_required: 'Pick a model.',
  model_invalid: "This model ID can't be used. Pick another model.",
  model_id_invalid: 'A model ID can use letters, numbers and . _ : @ / - only.',
  api_key_required: 'Enter the API key to turn the Recipe Assistant on.',
  api_key_invalid: 'Check the API key and enter it again.',
  key_required_for_new_base_url: 'A new address needs the key typed again.',
  model_unavailable: 'This model is not available. Pick another model.',
  model_cannot_read_recipes: "This model can't read recipes. Pick another model.",
  api_key_refused: 'Anthropic refused this API key.',
}
const FIELD_FALLBACK = "Feeder couldn't accept this value."

export const fieldMessage = (code: string): string => FIELD_COPY[code] ?? FIELD_FALLBACK

export interface SaveErrors {
  fields: Partial<Record<FormField, string>>
  /** A line for the whole form, when no field can carry the problem. */
  form?: string
}

const FORM_FIELDS: readonly string[] = ['enabled', 'baseUrl', 'model', 'apiKey']

/** 422 invalid_settings -> a message per field; anything else -> one general line (the server text is never shown). */
export function mapSaveError(err: unknown): SaveErrors {
  if (err instanceof ApiError) {
    if (err.status === 422 && err.code === 'invalid_settings') {
      const fields: SaveErrors['fields'] = {}
      const list = err.details.errors
      if (Array.isArray(list)) {
        for (const item of list as Array<{ field?: unknown; code?: unknown }>) {
          if (typeof item?.field === 'string' && FORM_FIELDS.includes(item.field) && typeof item.code === 'string') {
            fields[item.field as FormField] ??= fieldMessage(item.code)
          }
        }
      }
      if (Object.keys(fields).length > 0) return { fields }
    }
    if (err.status === 0) return { fields: {}, form: "You're offline. The settings were not saved." }
  }
  return { fields: {}, form: "Couldn't save the settings. Try again." }
}

/** Why the model list could not be loaded: a refused key is named, anything else is the plain notice. */
export function modelsErrorCopy(code: string | undefined): string {
  if (code === 'api_key_refused') return 'Anthropic refused this API key. Check it and try again.'
  return raStrings.modelListFailed
}

export function warningCopy(code: string): string {
  if (code === 'not_verified') return "Saved. Feeder couldn't check the model with Anthropic."
  if (code === 'no_photos') return "Saved. This model can't read photos."
  return 'Saved.'
}

const TEST_COPY: Record<string, string> = {
  assistant_bad_key: "The Recipe Assistant's API key was refused.",
  assistant_forbidden: "This API key may not use the Recipe Assistant's model.",
  assistant_billing: 'The Anthropic account has a billing problem.',
  assistant_model_unavailable: 'The chosen model is no longer available. Pick another model.',
  model_cannot_read_recipes: "This model can't read recipes. Pick another model.",
  assistant_request_rejected: 'The Recipe Assistant could not be reached at its address. Check the base URL.',
  assistant_unreachable: 'The Recipe Assistant could not be reached.',
  assistant_busy: 'Anthropic is busy. Try again in a minute.',
  assistant_rate_limited: 'Anthropic is busy. Try again in a minute.',
  assistant_declined: 'The model declined the test request. Pick another model.',
  assistant_output_too_long: "The model's answer was too long to use.",
  assistant_invalid_output: "The model's answer could not be used.",
}

export const testErrorCopy = (code: string): string => TEST_COPY[code] ?? 'The check failed.'

const CHECK_OK: Record<TestCheck['name'], string> = {
  key: 'API key accepted',
  model: 'Model available',
  output: 'Model answered correctly',
}
const CHECK_FAILED: Record<TestCheck['name'], string> = {
  key: 'The API key could not be checked.',
  model: 'The model could not be checked.',
  output: "The model's answer could not be used.",
}

/** One line per check: its name when it passed, the mapped reason (or the check's own line) when it failed. */
export function checkCopy(check: TestCheck): string {
  if (check.ok) return CHECK_OK[check.name]
  if (check.code && TEST_COPY[check.code]) return TEST_COPY[check.code]!
  return CHECK_FAILED[check.name]
}

/** A failed request to Test connection (not a failed check): field copy for the codes the form can fix, else a general line. */
export function mapTestError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. The test did not run."
    if (err.status === 422 && err.code in FIELD_COPY) return FIELD_COPY[err.code]!
  }
  return "Couldn't run the test. Try again."
}

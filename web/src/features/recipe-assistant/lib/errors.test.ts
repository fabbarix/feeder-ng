// API error code -> copy. Plain TypeScript; the page shows these, never the server's message.
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { checkCopy, fieldMessage, mapSaveError, mapTestError, modelsErrorCopy, testErrorCopy, warningCopy } from './errors'

describe('fieldMessage', () => {
  it.each([
    ['base_url_invalid', 'Enter a full address, like https://api.anthropic.com.'],
    ['base_url_not_https', 'Use https. Plain http is only for localhost.'],
    ['base_url_has_version', 'Leave out /v1; Feeder adds it.'],
    ['key_required_for_new_base_url', 'A new address needs the key typed again.'],
    ['api_key_required', 'Enter the API key to turn the Recipe Assistant on.'],
    ['api_key_refused', 'Anthropic refused this API key.'],
    ['model_required', 'Pick a model.'],
    ['model_invalid', "This model ID can't be used. Pick another model."],
    ['model_unavailable', 'This model is not available. Pick another model.'],
    ['model_cannot_read_recipes', "This model can't read recipes. Pick another model."],
  ])('%s', (code, copy) => expect(fieldMessage(code)).toBe(copy))
  it('has copy for every code of the frozen contract and falls back for an unknown one', () => {
    for (const c of ['secret_key_missing', 'base_url_invalid', 'base_url_not_https', 'base_url_has_version', 'model_required', 'model_id_invalid', 'model_invalid', 'api_key_required', 'api_key_invalid', 'key_required_for_new_base_url', 'model_unavailable', 'model_cannot_read_recipes', 'api_key_refused'])
      expect(fieldMessage(c), c).not.toBe(fieldMessage('brand_new_code'))
    expect(fieldMessage('brand_new_code')).toBe("Feeder couldn't accept this value.")
  })
  it('never contains a word from the Avoid list or the raw code', () => {
    expect(fieldMessage('secret_key_missing')).not.toMatch(/secret_key_missing/)
  })
})

describe('mapSaveError', () => {
  const invalid = (errors: unknown) => new ApiError(422, 'invalid_settings', 'invalid', { errors })
  it('puts each API field error under its field', () => {
    const out = mapSaveError(invalid([{ field: 'apiKey', code: 'api_key_refused' }, { field: 'baseUrl', code: 'base_url_has_version' }]))
    expect(out.fields).toEqual({ apiKey: 'Anthropic refused this API key.', baseUrl: 'Leave out /v1; Feeder adds it.' })
    expect(out.form).toBeUndefined()
  })
  it('a secret_key_missing error is a form-level message', () => {
    const out = mapSaveError(invalid([{ field: 'enabled', code: 'secret_key_missing' }]))
    expect(out.fields.enabled).toMatch(/secret key/i)
  })
  it('any other failure is a form-level message that does not echo the server text', () => {
    const out = mapSaveError(new ApiError(500, 'internal', 'sql: boom'))
    expect(out.fields).toEqual({})
    expect(out.form).toBe("Couldn't save the settings. Try again.")
    expect(mapSaveError(new ApiError(0, 'network', 'The network is unreachable')).form).toBe("You're offline. The settings were not saved.")
  })
})

describe('warningCopy', () => {
  it('has the two warnings of the contract', () => {
    expect(warningCopy('not_verified')).toBe("Saved. Feeder couldn't check the model with Anthropic.")
    expect(warningCopy('no_photos')).toBe("Saved. This model can't read photos.")
  })
})

describe('Test connection copy', () => {
  it('names each check', () => {
    expect(checkCopy({ name: 'key', ok: true })).toBe('API key accepted')
    expect(checkCopy({ name: 'model', ok: true })).toBe('Model available')
    expect(checkCopy({ name: 'output', ok: true })).toBe('Model answered correctly')
  })
  it('a failed check shows the mapped reason (design 1.4 user copy)', () => {
    expect(checkCopy({ name: 'key', ok: false, code: 'assistant_bad_key' })).toBe("The Recipe Assistant's API key was refused.")
    expect(checkCopy({ name: 'key', ok: false, code: 'assistant_forbidden' })).toBe("This API key may not use the Recipe Assistant's model.")
    expect(checkCopy({ name: 'key', ok: false, code: 'assistant_billing' })).toBe('The Anthropic account has a billing problem.')
    expect(checkCopy({ name: 'model', ok: false, code: 'assistant_model_unavailable' })).toBe('The chosen model is no longer available. Pick another model.')
    expect(checkCopy({ name: 'key', ok: false, code: 'assistant_request_rejected' })).toBe('The Recipe Assistant could not be reached at its address. Check the base URL.')
    expect(checkCopy({ name: 'key', ok: false, code: 'assistant_unreachable' })).toBe('The Recipe Assistant could not be reached.')
    expect(checkCopy({ name: 'output', ok: false, code: 'assistant_busy' })).toBe('Anthropic is busy. Try again in a minute.')
  })
  it('a failed check with no or an unknown code still says which check failed', () => {
    expect(checkCopy({ name: 'output', ok: false })).toBe("The model's answer could not be used.")
    expect(testErrorCopy('what_is_this')).toBe('The check failed.')
  })
  it('mapTestError: 422 key_required_for_new_base_url and base URL codes become field copy; the rest a general line', () => {
    expect(mapTestError(new ApiError(422, 'key_required_for_new_base_url', 'x'))).toBe('A new address needs the key typed again.')
    expect(mapTestError(new ApiError(422, 'base_url_not_https', 'x'))).toBe('Use https. Plain http is only for localhost.')
    expect(mapTestError(new ApiError(500, 'internal', 'boom'))).toBe("Couldn't run the test. Try again.")
    expect(mapTestError(new ApiError(0, 'network', 'down'))).toBe("You're offline. The test did not run.")
  })
})

describe('modelsErrorCopy', () => {
  it('names a refused key; any other failure is the plain list notice', () => {
    expect(modelsErrorCopy('api_key_refused')).toBe('Anthropic refused this API key. Check it and try again.')
    expect(modelsErrorCopy('internal')).toBe("Couldn't load the model list. The saved model is still used.")
    expect(modelsErrorCopy(undefined)).toBe("Couldn't load the model list. The saved model is still used.")
  })
})

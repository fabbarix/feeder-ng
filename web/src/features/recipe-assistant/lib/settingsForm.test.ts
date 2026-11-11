// The Settings form as a pure state machine: form <-> API body, "empty key is omitted", "origin changed needs the key".
import { describe, expect, it } from 'vitest'
import { settingsKeyUnreadable, settingsNoSecretKey, settingsOffNoKey, settingsOn, settingsRetiredModel } from '../fixtures'
import {
  canCallWithUnsavedValues,
  formFromSettings,
  isDirty,
  keyRowState,
  modelsRequest,
  originChanged,
  statusOf,
  testRequest,
  toPutBody,
  validateForm,
  withBaseUrl,
  withReplacing,
} from './settingsForm'

const form = (over = {}) => ({ ...formFromSettings(settingsOn), ...over })

describe('formFromSettings', () => {
  it('copies enabled, baseUrl and model; the key field starts empty and not replacing', () => {
    expect(formFromSettings(settingsOn)).toEqual({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', apiKey: '', replacing: false })
  })
})

describe('originChanged', () => {
  it('is false for a path-only change and true for another host', () => {
    expect(originChanged(form({ baseUrl: 'https://api.anthropic.com/prefix' }), settingsOn)).toBe(false)
    expect(originChanged(form({ baseUrl: 'https://gw.example.com' }), settingsOn)).toBe(true)
  })
  it('is true while the field holds something unparseable', () => expect(originChanged(form({ baseUrl: 'htt' }), settingsOn)).toBe(true))
})

describe('keyRowState', () => {
  it('saved: a saved readable key, same origin, not replacing', () => {
    expect(keyRowState(form(), settingsOn)).toEqual({ mode: 'saved', canKeepSaved: false, required: false, unreadable: false })
  })
  it('replacing: entry mode with Keep saved key', () => {
    expect(keyRowState(withReplacing(form(), true), settingsOn)).toEqual({ mode: 'entry', canKeepSaved: true, required: false, unreadable: false })
  })
  it('no key yet: entry, nothing to keep', () => {
    expect(keyRowState(formFromSettings(settingsOffNoKey), settingsOffNoKey)).toEqual({ mode: 'entry', canKeepSaved: false, required: false, unreadable: false })
  })
  it('unreadable key: entry, flagged, nothing to keep', () => {
    expect(keyRowState(formFromSettings(settingsKeyUnreadable), settingsKeyUnreadable)).toEqual({ mode: 'entry', canKeepSaved: false, required: false, unreadable: true })
  })
  it('origin changed: entry, required, Keep saved key hidden even if the Admin pressed Replace', () => {
    const f = withReplacing(form({ baseUrl: 'https://gw.example.com' }), true)
    expect(keyRowState(f, settingsOn)).toEqual({ mode: 'entry', canKeepSaved: false, required: true, unreadable: false })
  })
  it('returns to the saved row when the address goes back to the saved origin', () => {
    const changed = withBaseUrl(form(), 'https://gw.example.com')
    expect(keyRowState(withBaseUrl(changed, 'https://api.anthropic.com/x'), settingsOn).mode).toBe('saved')
  })
})

describe('withBaseUrl', () => {
  it('keeps what was typed in the key field while the address is edited (the key row switches, the text is not lost)', () => {
    const f = withBaseUrl(withReplacing({ ...form(), apiKey: 'sk-typed' }, true), 'https://gw.example.com')
    expect(f.baseUrl).toBe('https://gw.example.com')
    expect(f.apiKey).toBe('sk-typed')
  })
})

describe('toPutBody: an empty key is never sent', () => {
  it.each(['', '   ', undefined as unknown as string])('omits apiKey when it is %j', (apiKey) => {
    const body = toPutBody(form({ apiKey }), settingsOn)
    expect(body).toEqual({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5' })
    expect('apiKey' in body).toBe(false)
  })
  it('sends a typed key, trimmed at the ends', () => {
    expect(toPutBody(withReplacing(form({ apiKey: ' sk-new-5678 ' }), true), settingsOn).apiKey).toBe('sk-new-5678')
  })
  it('trims the address and the model id', () => {
    const body = toPutBody(form({ baseUrl: ' https://api.anthropic.com/gw ', model: ' claude-sonnet-5-5 ' }), settingsOn)
    expect(body.baseUrl).toBe('https://api.anthropic.com/gw')
    expect(body.model).toBe('claude-sonnet-5-5')
  })
  it('never sends the saved key: the settings object has none to send', () => {
    expect(JSON.stringify(toPutBody(form(), settingsOn))).not.toMatch(/sk-|1234/)
  })
})

describe('isDirty', () => {
  it('is false for an untouched form, and for Replace pressed with nothing typed', () => {
    expect(isDirty(form(), settingsOn)).toBe(false)
    expect(isDirty(withReplacing(form(), true), settingsOn)).toBe(false)
  })
  it('is true for each changed field, and for a typed key', () => {
    expect(isDirty(form({ enabled: false }), settingsOn)).toBe(true)
    expect(isDirty(form({ baseUrl: 'https://api.anthropic.com/x' }), settingsOn)).toBe(true)
    expect(isDirty(form({ model: 'claude-sonnet-5-5' }), settingsOn)).toBe(true)
    expect(isDirty(withReplacing(form({ apiKey: 'sk-x' }), true), settingsOn)).toBe(true)
  })
  it('ignores a trailing slash or blanks around the address', () => expect(isDirty(form({ baseUrl: ' https://api.anthropic.com/ ' }), settingsOn)).toBe(false))
})

describe('validateForm (codes are the API codes; shown after Save is pressed, base URL codes live)', () => {
  it('is clean for the saved form', () => expect(validateForm(form(), settingsOn)).toEqual({}))
  it('names the base URL code', () => {
    expect(validateForm(form({ baseUrl: 'http://example.com' }), settingsOn).baseUrl).toBe('base_url_not_https')
    expect(validateForm(form({ baseUrl: 'https://x.test/v1' }), settingsOn).baseUrl).toBe('base_url_has_version')
  })
  it('requires a model, with a valid id', () => {
    expect(validateForm(form({ model: '' }), settingsOn).model).toBe('model_required')
    expect(validateForm(form({ model: 'bad id!' }), settingsOn).model).toBe('model_id_invalid')
    expect(validateForm(form({ model: 'claude-x:1@2/3_4.5-6' }), settingsOn).model).toBeUndefined()
    expect(validateForm(form({ model: 'a'.repeat(129) }), settingsOn).model).toBe('model_id_invalid')
  })
  it('turning on without any key needs one', () => {
    const f = { ...formFromSettings(settingsOffNoKey), enabled: true }
    expect(validateForm(f, settingsOffNoKey).apiKey).toBe('api_key_required')
    expect(validateForm({ ...f, apiKey: 'sk-x' }, settingsOffNoKey).apiKey).toBeUndefined()
  })
  it('an unreadable saved key needs a new one when the assistant is on', () => {
    expect(validateForm(formFromSettings(settingsKeyUnreadable), settingsKeyUnreadable).apiKey).toBe('api_key_required')
  })
  it('a changed origin needs a typed key, even when off', () => {
    const f = form({ enabled: false, baseUrl: 'https://gw.example.com' })
    expect(validateForm(f, settingsOn).apiKey).toBe('key_required_for_new_base_url')
    expect(validateForm({ ...f, apiKey: 'sk-x' }, settingsOn).apiKey).toBeUndefined()
  })
  it('leaves the off form without a key alone', () => {
    expect(validateForm(formFromSettings(settingsOffNoKey), settingsOffNoKey)).toEqual({})
  })
})

describe('Test connection and the model list use the unsaved values', () => {
  it('are available with the saved key on the saved origin', () => expect(canCallWithUnsavedValues(form(), settingsOn)).toBe(true))
  it('are NOT available when the origin changed and no key is typed', () => {
    const f = form({ baseUrl: 'https://gw.example.com' })
    expect(canCallWithUnsavedValues(f, settingsOn)).toBe(false)
    expect(canCallWithUnsavedValues({ ...f, apiKey: 'sk-x' }, settingsOn)).toBe(true)
  })
  it('are NOT available while the address is invalid, there is no key at all, or the key is unreadable', () => {
    expect(canCallWithUnsavedValues(form({ baseUrl: 'http://example.com' }), settingsOn)).toBe(false)
    expect(canCallWithUnsavedValues(formFromSettings(settingsOffNoKey), settingsOffNoKey)).toBe(false)
    expect(canCallWithUnsavedValues({ ...formFromSettings(settingsOffNoKey), apiKey: 'sk-x' }, settingsOffNoKey)).toBe(true)
    expect(canCallWithUnsavedValues(formFromSettings(settingsKeyUnreadable), settingsKeyUnreadable)).toBe(false)
  })
  it('are NOT available without the server secret key', () => {
    expect(canCallWithUnsavedValues({ ...formFromSettings(settingsNoSecretKey), apiKey: 'sk-x' }, settingsNoSecretKey)).toBe(false)
  })

  it('modelsRequest: baseUrl only when the text differs from the saved one, apiKey only when typed', () => {
    expect(modelsRequest(form(), settingsOn)).toEqual({})
    expect(modelsRequest(form({ baseUrl: 'https://api.anthropic.com/prefix' }), settingsOn)).toEqual({ baseUrl: 'https://api.anthropic.com/prefix' })
    expect(modelsRequest({ ...form({ baseUrl: 'https://gw.example.com' }), apiKey: 'sk-n' }, settingsOn)).toEqual({ baseUrl: 'https://gw.example.com', apiKey: 'sk-n' })
    expect(modelsRequest(withReplacing({ ...form(), apiKey: '' }, true), settingsOn)).toEqual({})
  })
  it('testRequest adds the form model', () => {
    expect(testRequest(form({ model: 'claude-sonnet-5-5' }), settingsOn)).toEqual({ model: 'claude-sonnet-5-5' })
    expect(testRequest({ ...form({ baseUrl: 'https://gw.example.com' }), apiKey: 'sk-n' }, settingsOn)).toEqual({ baseUrl: 'https://gw.example.com', model: 'claude-haiku-5-5', apiKey: 'sk-n' })
  })
})

describe('statusOf (the status Chip, first match wins)', () => {
  it.each([
    [settingsNoSecretKey, 'Needs a secret key'],
    [settingsOffNoKey, 'Needs a key'],
    [settingsKeyUnreadable, "Key can't be read"],
    [settingsRetiredModel, 'Model unavailable'],
    [settingsOn, 'On'],
    [{ ...settingsOn, enabled: false }, 'Off'],
  ])('%#', (s, label) => expect(statusOf(s).label).toBe(label))
  it('gives a status colour: On success, Off neutral, the rest warning', () => {
    expect(statusOf(settingsOn).status).toBe('success')
    expect(statusOf({ ...settingsOn, enabled: false }).status).toBe('neutral')
    for (const s of [settingsNoSecretKey, settingsOffNoKey, settingsKeyUnreadable, settingsRetiredModel]) expect(statusOf(s).status).toBe('warning')
  })
})

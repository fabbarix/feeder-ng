// The Settings page end to end against a mocked API: states, form rules, key handling, models, Test connection, a11y.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { modelsApi, modelsCatalogue, settingsKeyUnreadable, settingsNoSecretKey, settingsOffNoKey, settingsOn, settingsRetiredModel } from '../fixtures'
import { ADMIN_ME, USER_ME, mockApi, pickOption, renderWithProviders } from '../test-utils'
import type { AssistantSettings } from '../types'
import { RecipeAssistantSettingsPage } from './RecipeAssistantSettingsPage'

afterEach(() => vi.unstubAllGlobals())

const SETTINGS = '/api/recipe-assistant/settings'
const MODELS = '/api/recipe-assistant/models'
const TEST = '/api/recipe-assistant/test'

function open(settings: AssistantSettings = settingsOn, over: Record<string, unknown> = {}, me: unknown = ADMIN_ME) {
  const api = mockApi({ 'GET /api/me': me, [`GET ${SETTINGS}`]: settings, [`POST ${MODELS}`]: modelsApi, ...over })
  renderWithProviders(<RecipeAssistantSettingsPage />, '/settings/recipe-assistant')
  return api
}
const loaded = () => screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
const url = () => screen.getByLabelText('API base URL')
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }))
const putBody = (api: ReturnType<typeof open>) => api.callsTo('PUT', SETTINGS)[0]?.body as Record<string, unknown> | undefined
const retype = async (el: HTMLElement, text: string) => {
  await userEvent.clear(el)
  await userEvent.type(el, text)
}

describe('access', () => {
  it('a plain User sees a not-allowed note and nothing is fetched', async () => {
    const api = open(settingsOn, {}, USER_ME)
    expect(await screen.findByText('Only an Admin can change the Recipe Assistant.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Recipe Assistant' })).toBeInTheDocument()
    expect(api.callsTo('GET', SETTINGS)).toHaveLength(0)
    expect(api.callsTo('POST', MODELS)).toHaveLength(0)
    expect(screen.queryByRole('switch')).toBeNull()
  })
  it('has the h1 "Recipe Assistant" and the privacy note (approved text), and no back link', async () => {
    open()
    await loaded()
    expect(screen.getByRole('heading', { level: 1, name: 'Recipe Assistant' })).toBeInTheDocument()
    expect(screen.getByText("Recipes you read are sent to Anthropic to be converted. Your Household's other data is never sent.")).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
  })
})

describe('secret key not configured', () => {
  it('shows the explanation, and every field is unavailable', async () => {
    const api = open(settingsNoSecretKey)
    await loaded()
    expect(screen.getByText(/the server needs a secret key \(FEEDER_SECRET_KEY\)/)).toBeInTheDocument()
    expect(screen.getByText(/Whoever runs your server sets it once/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Use the Recipe Assistant' })).toBeDisabled()
    expect(url()).toBeDisabled()
    expect(screen.getByLabelText('API key')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Needs a secret key')).toBeInTheDocument()
    expect(api.callsTo('POST', MODELS)).toHaveLength(0)
  })
})

describe('off, no key yet', () => {
  it('shows the key field (not the saved row), status "Needs a key", and Test connection is unavailable', async () => {
    open(settingsOffNoKey)
    const sw = await loaded()
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('API key')).toBeEnabled()
    expect(screen.queryByText('Key saved')).toBeNull()
    expect(screen.getByText('Needs a key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
  })
  it('turning on without a key is refused on Save with a message on the key field and no request', async () => {
    const api = open(settingsOffNoKey)
    await userEvent.click(await loaded())
    await save()
    expect(screen.getByLabelText('API key')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter the API key to turn the Recipe Assistant on.')).toBeInTheDocument()
    expect(api.callsTo('PUT', SETTINGS)).toHaveLength(0)
  })
  it('typing a key and saving PUTs it once, then shows "Key saved" with the new last four and no input', async () => {
    let cur: AssistantSettings = settingsOffNoKey
    const api = open(settingsOffNoKey, {
      [`GET ${SETTINGS}`]: () => cur,
      [`PUT ${SETTINGS}`]: () => (cur = { ...settingsOn, apiKeyLast4: '4321' }),
    })
    await userEvent.click(await loaded())
    await userEvent.type(screen.getByLabelText('API key'), 'sk-ant-abcd4321')
    await save()
    await screen.findByText('Key saved')
    expect(putBody(api)).toEqual({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', apiKey: 'sk-ant-abcd4321' })
    expect(screen.getByText('••••4321')).toBeInTheDocument()
    expect(screen.queryByLabelText('API key')).toBeNull()
    expect(document.body.textContent).not.toContain('sk-ant-abcd')
  })
})

describe('on with a saved key', () => {
  it('shows On, "Key saved ••••1234" with Replace and Remove, the Haiku model, and Save is disabled until something changes', async () => {
    open()
    expect(await loaded()).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.getByText('••••1234')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Claude Haiku 5.5'))
    expect(url()).toHaveValue('https://api.anthropic.com')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
  it('turning it off and saving sends no apiKey at all (an empty key keeps the saved one)', async () => {
    const api = open(settingsOn, { [`PUT ${SETTINGS}`]: { ...settingsOn, enabled: false } })
    await userEvent.click(await loaded())
    await save()
    await waitFor(() => expect(putBody(api)).toBeDefined())
    expect(putBody(api)).toEqual({ enabled: false, baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5' })
    expect(await screen.findByText('Off')).toBeInTheDocument()
  })
  it('lists the recent changes (Admin-only)', async () => {
    open()
    await loaded()
    const section = screen.getByRole('region', { name: 'Recent changes' })
    expect(within(section).getAllByRole('listitem')).toHaveLength(2)
    expect(await within(section).findByText(/Anna changed the model to Claude Sonnet 5.5/)).toBeInTheDocument() // the ID becomes a name once the list is in
  })
  it('Cancel puts the form back to the saved values', async () => {
    open()
    await loaded()
    await retype(url(), 'https://api.anthropic.com/gw')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(url()).toHaveValue('https://api.anthropic.com')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('Replace and Remove the key', () => {
  it('Replace shows the key field (focused) with "Keep saved key"; Keep brings the row back and sends nothing', async () => {
    const api = open()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
    const input = screen.getByLabelText('API key')
    expect(input).toHaveFocus()
    expect(screen.queryByText('Key saved')).toBeNull()
    await userEvent.type(input, 'sk-typed')
    await userEvent.click(screen.getByRole('button', { name: 'Keep saved key' }))
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.queryByLabelText('API key')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(api.callsTo('PUT', SETTINGS)).toHaveLength(0)
  })
  it('Replace, type and Save sends the new key and shows the new last four', async () => {
    const api = open(settingsOn, { [`PUT ${SETTINGS}`]: { ...settingsOn, apiKeyLast4: '7777' } })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await userEvent.type(screen.getByLabelText('API key'), 'sk-ant-new-7777')
    await save()
    await screen.findByText('••••7777')
    expect(putBody(api)!.apiKey).toBe('sk-ant-new-7777')
  })
  it('Replace left empty then Save sends no key', async () => {
    const api = open(settingsOn, { [`PUT ${SETTINGS}`]: settingsOn })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await userEvent.click(await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })) // make it dirty: off
    await save()
    await waitFor(() => expect(putBody(api)).toBeDefined())
    expect('apiKey' in putBody(api)!).toBe(false)
  })
  it('Remove asks first ("Remove the API key?"); Cancel sends nothing', async () => {
    const api = open()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove the API key?' })
    expect(within(dialog).getByText('The Recipe Assistant turns off until a new key is saved.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.callsTo('DELETE', `${SETTINGS}/api-key`)).toHaveLength(0)
    expect(screen.getByText('Key saved')).toBeInTheDocument()
  })
  it('Remove then confirm DELETEs, turns the assistant off, shows the key field and moves focus to it', async () => {
    const api = open(settingsOn, { [`DELETE ${SETTINGS}/api-key`]: { ...settingsOn, enabled: false, hasApiKey: false, apiKeyLast4: '' } })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove the API key?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.callsTo('DELETE', `${SETTINGS}/api-key`)).toHaveLength(1))
    const input = await screen.findByLabelText('API key')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByRole('switch', { name: 'Use the Recipe Assistant' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Needs a key')).toBeInTheDocument()
  })
  it('an unreadable saved key: says so, asks for the key again, status "Key can\'t be read"', async () => {
    open(settingsKeyUnreadable)
    await loaded()
    expect(screen.getByText("The saved API key can't be read with this server's secret key. Enter it again.")).toBeInTheDocument()
    expect(screen.getByLabelText('API key')).toBeEnabled()
    expect(screen.getByText("Key can't be read")).toBeInTheDocument()
  })
})

describe('base URL', () => {
  it('shows a hint for http, for a /v1 ending and for garbage, live, and blocks Save', async () => {
    const api = open()
    await loaded()
    await retype(url(), 'http://example.com')
    expect(url()).toHaveAttribute('aria-invalid', 'true')
    expect(url()).toHaveAccessibleDescription(expect.stringContaining('Use https. Plain http is only for localhost.'))
    await retype(url(), 'https://gw.example.com/v1')
    expect(url()).toHaveAccessibleDescription(expect.stringContaining('Leave out /v1; Feeder adds it.'))
    await retype(url(), 'nope')
    expect(url()).toHaveAccessibleDescription(expect.stringContaining('Enter a full address'))
    await save()
    expect(api.callsTo('PUT', SETTINGS)).toHaveLength(0)
  })
  it('accepts http for localhost', async () => {
    open()
    await loaded()
    await retype(url(), 'http://localhost:8080')
    expect(url()).not.toHaveAttribute('aria-invalid', 'true')
  })
  it('the helper says to leave it as is unless a gateway is used', async () => {
    open()
    await loaded()
    expect(url()).toHaveAccessibleDescription(expect.stringContaining('Leave as is unless you use a gateway.'))
  })
})

describe('changing the origin requires the key to be typed again', () => {
  it('a path-only change keeps the saved key row and Test connection', async () => {
    open()
    await loaded()
    await retype(url(), 'https://api.anthropic.com/anthropic')
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled()
  })
  it('another host replaces the row by a required key field with the helper, no Keep saved key', async () => {
    open()
    await loaded()
    await retype(url(), 'https://gw.example.com')
    const input = screen.getByLabelText(/API key/)
    expect(input).toBeRequired()
    expect(input).toHaveValue('')
    expect(input).toHaveAccessibleDescription(expect.stringContaining('A new address needs the key typed again.'))
    expect(screen.queryByText('Key saved')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep saved key' })).toBeNull()
  })
  it('blocks the model list refresh and Test connection, and sends no request to the new address', async () => {
    const api = open()
    await loaded()
    await waitFor(() => expect(api.callsTo('POST', MODELS)).toHaveLength(1)) // the initial list, for the saved address
    await retype(url(), 'https://gw.example.com')
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Refresh models' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(api.callsTo('POST', TEST)).toHaveLength(0)
    expect(api.callsTo('POST', MODELS)).toHaveLength(1)
    expect(screen.getByText(/Type the API key for the new address to test it/)).toBeInTheDocument()
  })
  it('Save without the key sends nothing', async () => {
    const api = open()
    await loaded()
    await retype(url(), 'https://gw.example.com')
    await save()
    expect(api.callsTo('PUT', SETTINGS)).toHaveLength(0)
    expect(screen.getByLabelText(/API key/)).toHaveAttribute('aria-invalid', 'true')
  })
  it('once a key is typed, Test connection and Refresh models send it with the new address', async () => {
    const api = open(settingsOn, { [`POST ${TEST}`]: { ok: true, checks: [], latencyMs: 5, model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' } } })
    await loaded()
    await retype(url(), 'https://gw.example.com')
    await userEvent.type(screen.getByLabelText(/API key/), 'sk-ant-gw-0001')
    expect(api.callsTo('POST', MODELS)).toHaveLength(1) // typing does not fetch
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    await waitFor(() => expect(api.callsTo('POST', TEST)).toHaveLength(1))
    expect(api.callsTo('POST', TEST)[0]!.body).toEqual({ baseUrl: 'https://gw.example.com', model: 'claude-haiku-5-5', apiKey: 'sk-ant-gw-0001' })
    await userEvent.click(screen.getByRole('button', { name: 'Refresh models' }))
    await waitFor(() => expect(api.callsTo('POST', MODELS)).toHaveLength(2))
    expect(api.callsTo('POST', MODELS)[1]!.body).toEqual({ baseUrl: 'https://gw.example.com', apiKey: 'sk-ant-gw-0001', refresh: true })
  })
  it('saving with the key sends baseUrl and apiKey together', async () => {
    const api = open(settingsOn, { [`PUT ${SETTINGS}`]: { ...settingsOn, baseUrl: 'https://gw.example.com', apiKeyLast4: '0001' } })
    await loaded()
    await retype(url(), 'https://gw.example.com')
    await userEvent.type(screen.getByLabelText(/API key/), 'sk-ant-gw-0001')
    await save()
    await waitFor(() => expect(putBody(api)).toBeDefined())
    expect(putBody(api)).toEqual({ enabled: true, baseUrl: 'https://gw.example.com', model: 'claude-haiku-5-5', apiKey: 'sk-ant-gw-0001' })
  })
  it('going back to the saved origin brings the saved key row back', async () => {
    open()
    await loaded()
    await retype(url(), 'https://gw.example.com')
    await retype(url(), 'https://api.anthropic.com')
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled()
  })
})

describe('model picker', () => {
  it('renders without waiting for the model list; the trigger shows the saved ID, then the name', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    open(settingsOn, { [`POST ${MODELS}`]: async () => (await gate, modelsApi) })
    await loaded()
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('claude-haiku-5-5')
    release()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Claude Haiku 5.5'))
  })
  it('Refresh models with a refused key says so', async () => {
    let refused = false
    const api = open(settingsOn, {
      [`POST ${MODELS}`]: () => (refused ? { status: 422, json: { error: { code: 'api_key_refused', message: 'x' } } } : modelsApi),
    })
    await loaded()
    await waitFor(() => expect(api.callsTo('POST', MODELS)).toHaveLength(1))
    refused = true
    await userEvent.click(screen.getByRole('button', { name: 'Refresh models' }))
    expect(await screen.findByText('Anthropic refused this API key. Check it and try again.')).toBeInTheDocument()
  })
  it('lists the models with Haiku 5.5 first, groups, price and speed hints and descriptions', async () => {
    open()
    await loaded()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeEnabled())
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent('Claude Haiku 5.5')
    expect(options[0]).toHaveTextContent('$ · Fastest · Fastest and cheapest. Default.')
    expect(screen.getByRole('option', { name: /Claude Sonnet 5\.5/ })).toHaveTextContent('$$ · Quick')
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Other models')).toBeInTheDocument()
    expect(screen.getByText('Older models')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Claude Opus 4\.8/ })).toHaveTextContent('Retires 12 Mar 2027')
  })
  it('picking Sonnet and saving PUTs the new model', async () => {
    const api = open(settingsOn, { [`PUT ${SETTINGS}`]: { ...settingsOn, model: 'claude-sonnet-5-5' } })
    await loaded()
    await pickOption('Model', /Claude Sonnet 5\.5/)
    await save()
    await waitFor(() => expect(putBody(api)).toBeDefined())
    expect(putBody(api)!.model).toBe('claude-sonnet-5-5')
  })
  it('a custom model ID comes from the create row', async () => {
    const api = open(settingsOn, { [`PUT ${SETTINGS}`]: { ...settingsOn, model: 'my-gateway-model' } })
    await loaded()
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    await userEvent.type(await screen.findByRole('searchbox'), 'my-gateway-model')
    await userEvent.click(await screen.findByRole('option', { name: 'Use model ID “my-gateway-model”' }))
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('my-gateway-model')
    await save()
    await waitFor(() => expect(putBody(api)).toBeDefined())
    expect(putBody(api)!.model).toBe('my-gateway-model')
  })
  it('an invalid custom ID is refused with a message and the model stays', async () => {
    open()
    await loaded()
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    await userEvent.type(await screen.findByRole('searchbox'), 'bad id!')
    await userEvent.click(await screen.findByRole('option', { name: 'Use model ID “bad id!”' }))
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Claude Haiku 5.5')
    expect(await screen.findByText('A model ID can use letters, numbers and . _ : @ / - only.')).toBeInTheDocument()
  })
  it('Refresh models bypasses the cache', async () => {
    const api = open()
    await loaded()
    await waitFor(() => expect(api.callsTo('POST', MODELS)).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Refresh models' }))
    await waitFor(() => expect(api.callsTo('POST', MODELS)).toHaveLength(2))
    expect(api.callsTo('POST', MODELS)[1]!.body).toEqual({ refresh: true })
  })
  it('the model tile is the #model target', async () => {
    open()
    await loaded()
    expect(document.getElementById('model')).not.toBeNull()
    expect(document.getElementById('model')!.contains(screen.getByRole('combobox', { name: 'Model' }))).toBe(true)
  })
  it('catalogue fallback shows the notice and the catalogue models', async () => {
    open(settingsOn, { [`POST ${MODELS}`]: modelsCatalogue })
    await loaded()
    expect(await screen.findByText(modelsCatalogue.notice!)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    expect(await screen.findByRole('option', { name: /Claude Sonnet 5\.5/ })).toBeInTheDocument()
  })
  it('when the list cannot be loaded it still shows the saved model and a plain notice', async () => {
    open(settingsOn, { [`POST ${MODELS}`]: { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    await loaded()
    expect(await screen.findByText("Couldn't load the model list. The saved model is still used.")).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('claude-haiku-5-5')
    expect(screen.getByRole('button', { name: 'Refresh models' })).toBeEnabled()
  })
})

describe('retired model', () => {
  it('asks to pick another model, flags the picker and the status, and is cleared by picking one', async () => {
    open(settingsRetiredModel)
    await loaded()
    expect(screen.getByText('Model unavailable')).toBeInTheDocument()
    expect(screen.getByText('The chosen model is no longer available. Pick another model.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveAccessibleDescription(expect.stringContaining('Pick another model.'))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeEnabled())
    await pickOption('Model', /Claude Sonnet 5\.5/)
    expect(screen.queryByText('The chosen model is no longer available. Pick another model.')).toBeNull()
  })
  it('a save refused with model_unavailable puts the same message on the picker', async () => {
    const api = open(settingsOn, {
      [`PUT ${SETTINGS}`]: { status: 422, json: { error: { code: 'invalid_settings', message: 'x', errors: [{ field: 'model', code: 'model_unavailable' }] } } },
    })
    await loaded()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeEnabled())
    await pickOption('Model', /Claude Opus 5\.5/)
    await save()
    expect(await screen.findByText('This model is not available. Pick another model.')).toBeInTheDocument()
    expect(api.callsTo('PUT', SETTINGS)).toHaveLength(1)
  })
})

describe('save results', () => {
  it('maps API field errors onto their fields', async () => {
    open(settingsOn, {
      [`PUT ${SETTINGS}`]: { status: 422, json: { error: { code: 'invalid_settings', message: 'x', errors: [{ field: 'apiKey', code: 'api_key_refused' }, { field: 'baseUrl', code: 'base_url_has_version' }] } } },
    })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await userEvent.type(screen.getByLabelText('API key'), 'sk-bad')
    await save()
    expect(await screen.findByText('Anthropic refused this API key.')).toBeInTheDocument()
    expect(screen.getByLabelText('API key')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('API key')).toHaveValue('sk-bad') // the typed text is kept for correction
    expect(screen.getByText('Leave out /v1; Feeder adds it.')).toBeInTheDocument()
  })
  it('shows a warning from a successful save (not_verified) and keeps the page usable', async () => {
    open(settingsOn, { [`PUT ${SETTINGS}`]: { ...settingsOn, enabled: false, warnings: [{ code: 'not_verified' }] } })
    await userEvent.click(await loaded())
    await save()
    expect(await screen.findByText("Saved. Feeder couldn't check the model with Anthropic.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('a server error shows one general line and keeps the form', async () => {
    open(settingsOn, { [`PUT ${SETTINGS}`]: { status: 500, json: { error: { code: 'internal', message: 'sql: boom' } } } })
    await userEvent.click(await loaded())
    await save()
    expect(await screen.findByText("Couldn't save the settings. Try again.")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('sql: boom')
    expect(screen.getByRole('switch', { name: 'Use the Recipe Assistant' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('Test connection', () => {
  it('uses the unsaved form values, shows progress, then the checks', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const api = open(settingsOn, {
      [`POST ${TEST}`]: async () => {
        await gate
        return { ok: true, latencyMs: 812, model: { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' }, checks: [{ name: 'key', ok: true }, { name: 'model', ok: true }, { name: 'output', ok: true }] }
      },
    })
    await loaded()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toBeEnabled())
    await pickOption('Model', /Claude Sonnet 5\.5/)
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText('Testing the connection…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test connection|Testing/ })).toBeDisabled()
    release()
    expect(await screen.findByText('Connected to Claude Sonnet 5.5')).toBeInTheDocument()
    for (const t of ['API key accepted', 'Model available', 'Model answered correctly']) expect(screen.getByText(t)).toBeInTheDocument()
    expect(api.callsTo('POST', TEST)[0]!.body).toEqual({ model: 'claude-sonnet-5-5' }) // saved key and origin: nothing else sent
  })
  it('a failing check shows the mapped reason', async () => {
    open(settingsOn, { [`POST ${TEST}`]: { ok: false, latencyMs: 90, checks: [{ name: 'key', ok: false, code: 'assistant_bad_key' }] } })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText("The Recipe Assistant's API key was refused.")).toBeInTheDocument()
  })
  it('a request error shows its mapped copy, not the server text', async () => {
    open(settingsOn, { [`POST ${TEST}`]: { status: 500, json: { error: { code: 'internal', message: 'stack trace' } } } })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText("Couldn't run the test. Try again.")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('stack trace')
  })
  it('editing a field clears the old result (it no longer describes the form)', async () => {
    open(settingsOn, { [`POST ${TEST}`]: { ok: true, latencyMs: 5, checks: [{ name: 'key', ok: true }], model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' } } })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText('Connected to Claude Haiku 5.5')
    await retype(url(), 'https://api.anthropic.com/x')
    expect(screen.queryByText('Connected to Claude Haiku 5.5')).toBeNull()
  })
})

describe('accessibility', () => {
  it('every control has a name; tiles are named regions; one h1', async () => {
    open()
    await loaded()
    for (const name of ['Recipe Assistant', 'Connection', 'Model', 'Test connection', 'Recent changes']) expect(screen.getByRole('region', { name })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    for (const el of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch'), ...screen.getAllByRole('combobox'), ...screen.getAllByRole('textbox')])
      expect(el, el.outerHTML).toHaveAccessibleName()
  })
  it('the status Chip carries its meaning as text and is in a polite live region', async () => {
    open()
    await loaded()
    const chip = screen.getByText('On')
    expect(chip.closest('[aria-live="polite"]')).not.toBeNull()
  })
  it('the unavailable states are explained in text, not only by a disabled look', async () => {
    open(settingsOffNoKey)
    await loaded()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
    expect(screen.getByText(/Type the API key to test the connection/)).toBeInTheDocument()
  })
  it('the key input never has autocomplete on and the key text never lands in the DOM as text', async () => {
    open(settingsOffNoKey)
    await loaded()
    const input = screen.getByLabelText('API key')
    expect(input).toHaveAttribute('autocomplete', 'off')
    await userEvent.type(input, 'sk-ant-visible')
    expect(document.body.textContent).not.toContain('sk-ant-visible')
  })
  it('Save and Cancel are reachable after the fields in tab order', async () => {
    open()
    await loaded()
    await retype(url(), 'https://api.anthropic.com/x')
    const all = screen.getAllByRole('button').map((b) => b.textContent)
    expect(all.indexOf('Save')).toBeGreaterThan(all.indexOf('Test connection'))
  })
})

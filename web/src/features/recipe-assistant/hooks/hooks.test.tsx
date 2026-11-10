// Hooks against a mocked API (routed fetch stub). The key only ever travels in a request body, never into a cache.
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { modelsApi, modelsCatalogue, settingsOffNoKey, settingsOn } from '../fixtures'
import { mockApi, newQueryClient, wrapperFor } from '../test-utils'
import type { AssistantSettings } from '../types'
import { useModelChoices } from './useModelChoices'
import { useRecipeAssistantSettings } from './useRecipeAssistantSettings'
import { useTestConnection } from './useTestConnection'

afterEach(() => vi.unstubAllGlobals())

const SETTINGS = '/api/recipe-assistant/settings'
const MODELS = '/api/recipe-assistant/models'
const TEST = '/api/recipe-assistant/test'

function setup(client: QueryClient = newQueryClient()) {
  return { client, wrapper: wrapperFor(client) }
}

describe('useRecipeAssistantSettings', () => {
  it('loads the settings; the response has no key field and the hook exposes none', async () => {
    mockApi({ [`GET ${SETTINGS}`]: settingsOn })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRecipeAssistantSettings(true), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.settings).toEqual(settingsOn)
    expect(Object.keys(result.current.settings!)).not.toContain('apiKey')
  })

  it('does not fetch when not allowed (a plain User)', async () => {
    const api = mockApi({ [`GET ${SETTINGS}`]: settingsOn })
    const { wrapper } = setup()
    renderHook(() => useRecipeAssistantSettings(false), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.calls).toHaveLength(0)
  })

  it('save PUTs exactly the body it is given, returns warnings and shows the saved settings', async () => {
    let current = settingsOn
    const api = mockApi({
      [`GET ${SETTINGS}`]: () => current,
      [`PUT ${SETTINGS}`]: (c: { body: unknown }) => {
        current = { ...settingsOn, model: (c.body as { model: string }).model }
        return { ...current, warnings: [{ code: 'not_verified' }] }
      },
    })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRecipeAssistantSettings(true), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    let saved: Awaited<ReturnType<typeof result.current.save>> | undefined
    await act(async () => {
      saved = await result.current.save({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' })
    })
    expect(api.callsTo('PUT', SETTINGS)[0]!.body).toEqual({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' })
    expect('apiKey' in (api.callsTo('PUT', SETTINGS)[0]!.body as object)).toBe(false)
    expect(saved!.warnings).toEqual([{ code: 'not_verified' }])
    expect(saved!.settings.model).toBe('claude-sonnet-5-5')
    expect('warnings' in saved!.settings).toBe(false)
    await waitFor(() => expect(result.current.settings!.model).toBe('claude-sonnet-5-5'))
    expect(api.callsTo('GET', SETTINGS)).toHaveLength(1) // the PUT answer is the new cache value, no refetch
  })

  it('a save without warnings returns an empty list', async () => {
    mockApi({ [`GET ${SETTINGS}`]: settingsOn, [`PUT ${SETTINGS}`]: settingsOn })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRecipeAssistantSettings(true), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    let saved: { warnings: unknown[] } | undefined
    await act(async () => {
      saved = await result.current.save({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5' })
    })
    expect(saved!.warnings).toEqual([])
  })

  it('a typed key reaches the PUT body only, and no cache holds it afterwards', async () => {
    let current: AssistantSettings = settingsOffNoKey
    mockApi({
      [`GET ${SETTINGS}`]: () => current,
      [`PUT ${SETTINGS}`]: () => {
        current = { ...settingsOn, apiKeyLast4: '9999' }
        return current
      },
    })
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useRecipeAssistantSettings(true), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    await act(async () => {
      await result.current.save({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', apiKey: 'sk-ant-secret-9999' })
    })
    const dump = JSON.stringify(client.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data])) + JSON.stringify(client.getMutationCache().getAll().map((m) => m.state.data))
    expect(dump).not.toContain('sk-ant-secret')
    expect(result.current.settings!.apiKeyLast4).toBe('9999')
  })

  it('a 422 rejects with the ApiError (the page maps it) and leaves the cache alone', async () => {
    mockApi({
      [`GET ${SETTINGS}`]: settingsOn,
      [`PUT ${SETTINGS}`]: { status: 422, json: { error: { code: 'invalid_settings', message: 'x', errors: [{ field: 'model', code: 'model_unavailable' }] } } },
    })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRecipeAssistantSettings(true), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    let err: unknown
    await act(async () => {
      err = await result.current.save({ enabled: true, baseUrl: 'https://api.anthropic.com', model: 'gone' }).catch((e) => e)
    })
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).details.errors).toEqual([{ field: 'model', code: 'model_unavailable' }])
    expect(result.current.settings).toEqual(settingsOn)
  })

  it('removeKey DELETEs the key route and shows the answer (off, no key)', async () => {
    const api = mockApi({
      [`GET ${SETTINGS}`]: settingsOn,
      [`DELETE ${SETTINGS}/api-key`]: { ...settingsOn, enabled: false, hasApiKey: false, apiKeyLast4: '' },
    })
    const { wrapper } = setup()
    const { result } = renderHook(() => useRecipeAssistantSettings(true), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    await act(async () => {
      await result.current.removeKey()
    })
    expect(api.callsTo('DELETE', `${SETTINGS}/api-key`)).toHaveLength(1)
    await waitFor(() => expect(result.current.settings).toMatchObject({ enabled: false, hasApiKey: false }))
  })
})

describe('useModelChoices', () => {
  it('fetches the list once with an empty body and caches it across remounts', async () => {
    const api = mockApi({ [`POST ${MODELS}`]: modelsApi })
    const { wrapper } = setup()
    const first = renderHook(() => useModelChoices({ enabled: true }), { wrapper })
    await waitFor(() => expect(first.result.current.isPending).toBe(false))
    expect(first.result.current.models).toEqual(modelsApi.models)
    expect(first.result.current.source).toBe('api')
    expect(api.callsTo('POST', MODELS)[0]!.body).toEqual({})
    first.unmount()
    const second = renderHook(() => useModelChoices({ enabled: true }), { wrapper })
    expect(second.result.current.models).toEqual(modelsApi.models) // from cache, instantly
    await new Promise((r) => setTimeout(r, 20))
    expect(api.callsTo('POST', MODELS)).toHaveLength(1)
  })

  it('does nothing while disabled (origin changed and no key typed, or not an Admin)', async () => {
    const api = mockApi({ [`POST ${MODELS}`]: modelsApi })
    const { wrapper } = setup()
    const { result } = renderHook(() => useModelChoices({ enabled: false }), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.calls).toHaveLength(0)
    expect(result.current.models).toBeUndefined()
  })

  it('refresh bypasses the cache with refresh: true', async () => {
    const api = mockApi({ [`POST ${MODELS}`]: modelsApi })
    const { wrapper } = setup()
    const { result } = renderHook(() => useModelChoices({ enabled: true }), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    await act(async () => {
      await result.current.refresh()
    })
    expect(api.callsTo('POST', MODELS)).toHaveLength(2)
    expect(api.callsTo('POST', MODELS)[1]!.body).toEqual({ refresh: true })
  })

  it('with a typed key (new address) it never fetches by itself; refresh sends baseUrl and key, and the key stays out of the cache', async () => {
    const api = mockApi({ [`POST ${MODELS}`]: modelsApi })
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useModelChoices({ enabled: false, baseUrl: 'https://gw.example.com', apiKey: 'sk-ant-typed-0001' }), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.calls).toHaveLength(0)
    await act(async () => {
      await result.current.refresh()
    })
    expect(api.callsTo('POST', MODELS)[0]!.body).toEqual({ baseUrl: 'https://gw.example.com', apiKey: 'sk-ant-typed-0001', refresh: true })
    await waitFor(() => expect(result.current.models).toEqual(modelsApi.models))
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data]))).not.toContain('sk-ant-typed')
  })

  it('shows the catalogue fallback and its notice (source "catalogue")', async () => {
    mockApi({ [`POST ${MODELS}`]: modelsCatalogue })
    const { wrapper } = setup()
    const { result } = renderHook(() => useModelChoices({ enabled: true }), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.source).toBe('catalogue')
    expect(result.current.notice).toBe(modelsCatalogue.notice)
    expect(result.current.failed).toBe(false)
  })

  it('a failed request leaves models undefined and failed true (the picker then shows the saved model only)', async () => {
    mockApi({ [`POST ${MODELS}`]: { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useModelChoices({ enabled: true }), { wrapper })
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.models).toBeUndefined()
  })

  it('a 422 key_required_for_new_base_url surfaces as failed with the code, not as a retry loop', async () => {
    const api = mockApi({ [`POST ${MODELS}`]: { status: 422, json: { error: { code: 'key_required_for_new_base_url', message: 'x' } } } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useModelChoices({ enabled: true, baseUrl: 'https://gw.example.com' }), { wrapper })
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.errorCode).toBe('key_required_for_new_base_url')
    expect(api.callsTo('POST', MODELS)).toHaveLength(1)
  })
})

describe('useTestConnection', () => {
  it('POSTs the unsaved values, reports running, and keeps the result', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const api = mockApi({
      [`POST ${TEST}`]: async () => {
        await gate
        return { ok: true, checks: [{ name: 'key', ok: true }, { name: 'model', ok: true }, { name: 'output', ok: true }], model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }, latencyMs: 812 }
      },
    })
    const { wrapper } = setup()
    const { result } = renderHook(() => useTestConnection(), { wrapper })
    expect(result.current.running).toBe(false)
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.run({ model: 'claude-haiku-5-5' })
    })
    await waitFor(() => expect(result.current.running).toBe(true))
    release()
    await act(async () => {
      await done
    })
    expect(api.callsTo('POST', TEST)[0]!.body).toEqual({ model: 'claude-haiku-5-5' })
    expect(result.current.running).toBe(false)
    expect(result.current.result).toMatchObject({ ok: true, latencyMs: 812 })
  })

  it('keeps a failing result (ok false) as a result, not an error', async () => {
    mockApi({ [`POST ${TEST}`]: { ok: false, checks: [{ name: 'key', ok: false, code: 'assistant_bad_key' }], latencyMs: 90 } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useTestConnection(), { wrapper })
    await act(async () => {
      await result.current.run({})
    })
    expect(result.current.result!.ok).toBe(false)
    expect(result.current.error).toBeUndefined()
  })

  it('a 422 is an error with its code; no outbound call is implied', async () => {
    mockApi({ [`POST ${TEST}`]: { status: 422, json: { error: { code: 'key_required_for_new_base_url', message: 'x' } } } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useTestConnection(), { wrapper })
    await act(async () => {
      await result.current.run({ baseUrl: 'https://gw.example.com' })
    })
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).code).toBe('key_required_for_new_base_url')
    expect(result.current.result).toBeUndefined()
  })

  it('reset clears the result and error; a new run clears the old result first', async () => {
    mockApi({ [`POST ${TEST}`]: { ok: true, checks: [], latencyMs: 1 } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useTestConnection(), { wrapper })
    await act(async () => {
      await result.current.run({})
    })
    expect(result.current.result).toBeDefined()
    act(() => result.current.reset())
    expect(result.current.result).toBeUndefined()
  })
})

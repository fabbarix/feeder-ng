import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
vi.mock('../../lib/http', () => {
  const rec = (m: string) => async (path: string, body?: unknown) => {
    calls.push([m, path, body])
    return m === 'GET' && path.includes('agent-prompt') ? { prompt: 'PROMPT' } : {}
  }
  return { http: { get: rec('GET'), post: rec('POST'), put: rec('PUT'), patch: rec('PATCH'), delete: rec('DELETE') } }
})

import { importApi } from './api'

const none = { ingredients: [], conversions: [], recipes: [], courses: [] }

describe('importApi', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('opens a review with the file text', async () => {
    await importApi.open('{"a":1}')
    expect(calls).toEqual([['POST', '/api/imports', { text: '{"a":1}' }]])
  })
  it('plans and confirms with the decisions, encoding the id', async () => {
    await importApi.plan('ab/c', none)
    await importApi.confirm('ab/c', none)
    await importApi.discard('ab/c')
    expect(calls).toEqual([
      ['POST', '/api/imports/ab%2Fc/plan', { decisions: none }],
      ['POST', '/api/imports/ab%2Fc/confirm', { decisions: none }],
      ['DELETE', '/api/imports/ab%2Fc', undefined],
    ])
  })
  it('reads the Agent Prompt text', async () => {
    expect(await importApi.agentPrompt()).toBe('PROMPT')
    expect(calls[0]).toEqual(['GET', '/api/recipe-file/agent-prompt', undefined])
  })
  it('lists Recipes including archived ones', async () => {
    await importApi.recipes()
    expect(calls[0]![1]).toBe('/api/recipes?archived=all')
  })
})

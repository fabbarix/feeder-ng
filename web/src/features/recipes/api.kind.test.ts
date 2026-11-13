import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
vi.mock('../../lib/http', () => {
  const rec = (m: string) => async (path: string, body?: unknown) => {
    calls.push([m, path, body])
    return []
  }
  return { http: { get: rec('GET'), post: rec('POST'), put: rec('PUT'), patch: rec('PATCH'), delete: rec('DELETE') } }
})

import { recipesApi } from './api'

beforeEach(() => {
  calls.length = 0
})

describe('recipesApi.list kind (GET /api/recipes?kind=plannable|base|all)', () => {
  it('sends ?kind=base and ?kind=all, and nothing for the default', async () => {
    await recipesApi.list({ kind: 'base' })
    await recipesApi.list({ kind: 'all' })
    await recipesApi.list({ kind: 'plannable' })
    await recipesApi.list({})
    expect(calls.map((c) => c[1])).toEqual(['/api/recipes?kind=base', '/api/recipes?kind=all', '/api/recipes', '/api/recipes'])
  })
  it('keeps the other filters beside it', async () => {
    await recipesApi.list({ q: 'sauce', kind: 'base', archived: 'no' })
    expect(calls[0]?.[1]).toBe('/api/recipes?q=sauce&archived=no&kind=base')
  })
})

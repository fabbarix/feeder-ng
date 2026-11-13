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

/** Path and query compared with the parameters in any order. */
const parts = (url: string | undefined) => {
  const [path, query = ''] = (url ?? '').split('?')
  return { path, params: Object.fromEntries([...new URLSearchParams(query).entries()]) }
}

describe('recipesApi.list kind (GET /api/recipes?kind=plannable|base|all)', () => {
  it('sends ?kind=base and ?kind=all, and nothing for the default', async () => {
    await recipesApi.list({ kind: 'base' })
    await recipesApi.list({ kind: 'all' })
    await recipesApi.list({ kind: 'plannable' })
    await recipesApi.list({})
    expect(calls.map((c) => parts(c[1]))).toEqual([
      { path: '/api/recipes', params: { kind: 'base' } },
      { path: '/api/recipes', params: { kind: 'all' } },
      { path: '/api/recipes', params: {} },
      { path: '/api/recipes', params: {} },
    ])
  })
  it('keeps the other filters beside it', async () => {
    await recipesApi.list({ q: 'sauce', kind: 'base', archived: 'no' })
    expect(parts(calls[0]?.[1])).toEqual({ path: '/api/recipes', params: { q: 'sauce', archived: 'no', kind: 'base' } })
  })
})

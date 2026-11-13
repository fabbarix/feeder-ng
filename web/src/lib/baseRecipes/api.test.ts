import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
vi.mock('../http', () => {
  const rec = (m: string) => async (path: string, body?: unknown) => {
    calls.push([m, path, body])
    return path.endsWith('/link-candidates') ? { lines: [{ lineId: 1 }] } : {}
  }
  return { http: { get: rec('GET'), post: rec('POST'), put: rec('PUT'), patch: rec('PATCH'), delete: rec('DELETE') } }
})

import { baseRecipesApi } from './api'

beforeEach(() => {
  calls.length = 0
})

describe('baseRecipesApi (routes of internal/recipe/httpapi/base_test.go)', () => {
  it('converts a Recipe: dry run, apply, and back', async () => {
    await baseRecipesApi.toBasePlan(4)
    await baseRecipesApi.toBase(4, { yield: 4, yieldUnit: 'portion' })
    await baseRecipesApi.toPlannable(4, { yield: 4 })
    expect(calls).toEqual([
      ['POST', '/api/recipes/4/to-base?dryRun=1', undefined],
      ['POST', '/api/recipes/4/to-base', { yield: 4, yieldUnit: 'portion' }],
      ['POST', '/api/recipes/4/to-plannable', { yield: 4 }],
    ])
  })
  it('links and unlinks one line', async () => {
    await baseRecipesApi.linkLine(7, 70, 3)
    await baseRecipesApi.unlinkLine(7, 70)
    expect(calls).toEqual([
      ['POST', '/api/recipes/7/lines/70/base', { baseRecipeId: 3 }],
      ['DELETE', '/api/recipes/7/lines/70/base', undefined],
    ])
  })
  it('lists the candidates and links or unlinks them in bulk', async () => {
    await baseRecipesApi.linkCandidates(3)
    await baseRecipesApi.link(3, [1, 2])
    await baseRecipesApi.unlink(3, [1, 2])
    expect(calls).toEqual([
      ['GET', '/api/recipes/3/link-candidates', undefined],
      ['POST', '/api/recipes/3/link', { lineIds: [1, 2] }],
      ['POST', '/api/recipes/3/unlink', { lineIds: [1, 2] }],
    ])
  })
  it('unwraps the candidates from { lines }', async () => {
    expect(await baseRecipesApi.linkCandidates(3)).toEqual([{ lineId: 1 }])
  })
})

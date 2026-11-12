// tagMergeApi.impactInto: GET /api/tags/{id}/impact?into=<id> (tg-api.md), which lib/tags/api.ts does not wrap.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/http'
import { tagMergeApi } from './api'
import { fishIntoSeafood } from './fixtures'
import { mockApi } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

describe('tagMergeApi.impactInto', () => {
  it('asks for the impact of the Tag with ?into= and answers bothRecipes', async () => {
    const api = mockApi({ 'GET /api/tags/1/impact?into=3': fishIntoSeafood })
    const impact = await tagMergeApi.impactInto(1, 3)
    expect(impact.bothRecipes).toBe(4)
    expect(impact.recipes).toBe(12)
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/tags/1/impact?into=3'])
  })

  it('keeps a bothRecipes of 0', async () => {
    mockApi({ 'GET /api/tags/1/impact?into=3': { ...fishIntoSeafood, bothRecipes: 0 } })
    expect((await tagMergeApi.impactInto(1, 3)).bothRecipes).toBe(0)
  })

  it('rejects with the ApiError of a refused request', async () => {
    mockApi({ 'GET /api/tags/9/impact?into=3': { status: 404, json: { error: { code: 'not_found', message: 'no such Tag' } } } })
    await expect(tagMergeApi.impactInto(9, 3)).rejects.toBeInstanceOf(ApiError)
  })
})

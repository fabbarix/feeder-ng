// B9-32 (PC-07): planApi.markRecipes is POST /api/courses/<id>/recipes { recipeIds } and answers { marked, changes, undoToken? }. TEST-AUTHOR test.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planApi } from './api'
import { mockApi } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

describe('planApi.markRecipes', () => {
  it('POSTs the ids to the Course and returns the answer', async () => {
    const answer = { marked: 2, changes: [], undoToken: 'tok' }
    const api = mockApi({ 'POST /api/courses/3/recipes': answer })
    expect(await planApi.markRecipes(3, [11, 12])).toEqual(answer)
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/courses/3/recipes'])
    expect(api.calls[0]!.body).toEqual({ recipeIds: [11, 12] })
  })
})

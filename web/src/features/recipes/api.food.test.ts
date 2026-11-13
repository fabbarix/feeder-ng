// H5: every Ingredient picker of the Recipe feature is food only: a Supply never appears on a Recipe line, in a Ready Meal or as a "via" name.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
vi.mock('../../lib/http', () => ({
  http: { get: async (p: string) => (calls.push(['GET', p]), []), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { recipesApi } from './api'

describe('recipesApi.ingredients', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('asks GET /api/ingredients?kind=food', async () => {
    await recipesApi.ingredients()
    expect(calls).toEqual([['GET', '/api/ingredients?kind=food']])
  })
})

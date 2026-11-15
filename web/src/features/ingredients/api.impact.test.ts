// B9-48 (SAFE-02): the client of GET /api/ingredients/{id}/impact (B9-06: { references: { <mover>: n }, total: n }).
// API pinned here: ingredientsApi.impact(id): Promise<IngredientImpact>, IngredientImpact = { references: Record<string, number>; total: number } (types.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
vi.mock('../../lib/http', () => ({
  http: { get: async (path: string) => { calls.push(['GET', path]); return { references: { products: 2 }, total: 2 } } },
}))

import { ingredientsApi } from './api'

describe('ingredientsApi.impact', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('reads the impact of one Ingredient and changes nothing', async () => {
    const got = await ingredientsApi.impact(7)
    expect(calls).toEqual([['GET', '/api/ingredients/7/impact']])
    expect(got).toEqual({ references: { products: 2 }, total: 2 })
  })
})

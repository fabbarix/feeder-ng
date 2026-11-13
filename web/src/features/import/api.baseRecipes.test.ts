// BR-E: the Recipe File calls that carry Base recipe answers. RED until importApi has recipeCalls (the rest already passes the decisions through).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
vi.mock('../../lib/http', () => {
  const rec = (m: string) => async (path: string, body?: unknown) => {
    calls.push([m, path, body])
    if (m === 'GET' && path === '/api/recipes/1') {
      return {
        id: 1,
        name: 'Lasagne',
        lines: [
          { id: 1, ingredientId: 2, ingredientName: 'pasta', quantity: 200, unit: 'g', baseRecipe: null },
          { id: 2, ingredientId: 3, ingredientName: 'Béchamel', quantity: 500, unit: 'ml', baseRecipe: { id: 10, name: 'Béchamel', archived: false } },
        ],
      }
    }
    return {}
  }
  return { http: { get: rec('GET'), post: rec('POST'), put: rec('PUT'), patch: rec('PATCH'), delete: rec('DELETE') } }
})

import { importApi } from './api'

describe('importApi, Base recipes', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('sends the tile answers and take-over answers with the plan and the Confirm', async () => {
    const decisions = {
      ingredients: [],
      conversions: [],
      recipes: [],
      courses: [],
      baseRecipeLines: { '$.recipes[0].ingredients[1]': { action: 'create', readNext: true } },
      takeOvers: { '$.recipes[0].ingredients[1]': false },
    }
    await importApi.plan('r1', decisions)
    await importApi.confirm('r1', decisions)
    expect(calls).toEqual([
      ['POST', '/api/imports/r1/plan', { decisions }],
      ['POST', '/api/imports/r1/confirm', { decisions }],
    ])
  })

  it('reads the Base recipes a Recipe calls for from its detail (the Base recipe lines)', async () => {
    expect(await importApi.recipeCalls(1)).toEqual({ name: 'Lasagne', calls: [{ id: 10, name: 'Béchamel' }] })
    expect(calls[0]).toEqual(['GET', '/api/recipes/1', undefined])
  })
})

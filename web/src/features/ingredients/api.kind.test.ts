// H5: ?kind= on the list and the search, and the kind / restockLevel fields on create and patch (H2's API).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?]> = []
vi.mock('../../lib/http', () => {
  const rec = (m: string) => async (path: string, body?: unknown) => {
    calls.push([m, path, body])
    return {}
  }
  return { http: { get: rec('GET'), post: rec('POST'), put: rec('PUT'), patch: rec('PATCH'), delete: rec('DELETE') } }
})

import { ingredientsApi } from './api'

describe('ingredientsApi: kind', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('lists one kind', async () => {
    await ingredientsApi.list(undefined, 'food')
    await ingredientsApi.list(undefined, 'supply')
    await ingredientsApi.list('red onion', 'food')
    expect(calls).toEqual([
      ['GET', '/api/ingredients?kind=food', undefined],
      ['GET', '/api/ingredients?kind=supply', undefined],
      ['GET', '/api/ingredients?q=red%20onion&kind=food', undefined],
    ])
  })
  it('still lists both kinds when no kind is given (no other caller changes)', async () => {
    await ingredientsApi.list()
    expect(calls).toEqual([['GET', '/api/ingredients', undefined]])
  })
  it('searches within a kind', async () => {
    await ingredientsApi.search('soap', undefined, 'supply')
    await ingredientsApi.search('olive & oil', 3, 'food')
    await ingredientsApi.search('salt')
    expect(calls).toEqual([
      ['GET', '/api/ingredients/search?q=soap&kind=supply', undefined],
      ['GET', '/api/ingredients/search?q=olive%20%26%20oil&limit=3&kind=food', undefined],
      ['GET', '/api/ingredients/search?q=salt', undefined],
    ])
  })
  it('creates a Supply with its Restock level and patches kind and level', async () => {
    await ingredientsApi.create({ name: 'dish soap', baseUnit: 'ml', kind: 'supply', restockLevel: 500 })
    await ingredientsApi.patch(21, { restockLevel: null })
    await ingredientsApi.patch(21, { kind: 'food' })
    expect(calls).toEqual([
      ['POST', '/api/ingredients', { name: 'dish soap', baseUnit: 'ml', kind: 'supply', restockLevel: 500 }],
      ['PATCH', '/api/ingredients/21', { restockLevel: null }],
      ['PATCH', '/api/ingredients/21', { kind: 'food' }],
    ])
  })
})

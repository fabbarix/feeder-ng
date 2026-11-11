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

describe('ingredientsApi', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('lists and searches with encoded queries', async () => {
    await ingredientsApi.list()
    await ingredientsApi.list('red onion')
    await ingredientsApi.search('olive & oil', 3)
    expect(calls).toEqual([
      ['GET', '/api/ingredients', undefined],
      ['GET', '/api/ingredients?q=red%20onion', undefined],
      ['GET', '/api/ingredients/search?q=olive%20%26%20oil&limit=3', undefined],
    ])
  })
  it('creates, patches and deletes by id', async () => {
    await ingredientsApi.create({ name: 'salt', baseUnit: 'g' })
    await ingredientsApi.patch(4, { shelfLifeDays: null })
    await ingredientsApi.remove(4)
    expect(calls).toEqual([
      ['POST', '/api/ingredients', { name: 'salt', baseUnit: 'g' }],
      ['PATCH', '/api/ingredients/4', { shelfLifeDays: null }],
      ['DELETE', '/api/ingredients/4', undefined],
    ])
  })
  it('sets and removes conversions by unit', async () => {
    await ingredientsApi.setConversion(4, { unit: 'table spoon', toBase: 15 })
    await ingredientsApi.removeConversion(4, 'table spoon')
    expect(calls).toEqual([
      ['PUT', '/api/ingredients/4/conversions/table%20spoon', { toBase: 15 }],
      ['DELETE', '/api/ingredients/4/conversions/table%20spoon', undefined],
    ])
  })
  it('previews and performs a merge', async () => {
    await ingredientsApi.mergePreview(4, 9)
    await ingredientsApi.merge(4, { into: 9, resolutions: { shelfLifeDays: null } })
    expect(calls).toEqual([
      ['GET', '/api/ingredients/4/merge-preview?into=9', undefined],
      ['POST', '/api/ingredients/4/merge', { into: 9, resolutions: { shelfLifeDays: null } }],
    ])
  })
})

// IM2: the picture travels in the normal create and patch bodies (contract only: the shapes are in types.ts).
describe('ingredientsApi: picture', () => {
  it('create sends the image id and patch can set or clear it', async () => {
    calls.length = 0
    await ingredientsApi.create({ name: 'Flour', baseUnit: 'g', image: 'a'.repeat(32) })
    await ingredientsApi.patch(1, { image: '' })
    expect(calls).toContainEqual(['POST', '/api/ingredients', { name: 'Flour', baseUnit: 'g', image: 'a'.repeat(32) }])
    expect(calls).toContainEqual(['PATCH', '/api/ingredients/1', { image: '' }])
  })
})

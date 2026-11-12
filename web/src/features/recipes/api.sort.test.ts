// Beta.5 F7: the Recipes API client sends ?sort=.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../settings/test-utils'
import { recipesApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('recipesApi list with a sort', () => {
  it('sends ?sort=last_cooked_asc and ?sort=last_cooked_desc', async () => {
    const api = mockApi({ 'GET /api/recipes?sort=last_cooked_asc': [], 'GET /api/recipes?sort=last_cooked_desc': [] })
    await recipesApi.list({ sort: 'last_cooked_asc' })
    await recipesApi.list({ sort: 'last_cooked_desc' })
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes?sort=last_cooked_asc', '/api/recipes?sort=last_cooked_desc'])
  })
  it('sends nothing for the name sort (the server default) or no sort', async () => {
    const api = mockApi({ 'GET /api/recipes': [] })
    await recipesApi.list({ sort: 'name' })
    await recipesApi.list({})
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes', '/api/recipes'])
  })
  it('combines it with the other filters', async () => {
    const api = mockApi({ 'GET /api/recipes?q=rice&tag=quick&archived=all&course=2&sort=last_cooked_desc': [] })
    await recipesApi.list({ q: 'rice', tag: 'quick', archived: 'all', course: 2, sort: 'last_cooked_desc' })
    expect(api.calls).toHaveLength(1)
  })
})

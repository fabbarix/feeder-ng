// b8-recipes: the Recipes API client sends one ?tag= per Tag (docs/dev/design/b8-recipes.md 3.4). The server keeps the Recipes that carry every one.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../settings/test-utils'
import { recipesApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('recipesApi list with Tags', () => {
  it('sends a single Tag as ?tag=x (the URL that always worked)', async () => {
    const api = mockApi({ 'GET /api/recipes?tag=fish': [] })
    await recipesApi.list({ tags: ['fish'] })
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes?tag=fish'])
  })
  it('repeats ?tag= for every Tag, in order, escaped', async () => {
    const api = mockApi({ 'GET /api/recipes?tag=fish&tag=slow+cooker&tag=a+%26+b': [] })
    await recipesApi.list({ tags: ['fish', 'slow cooker', 'a & b'] })
    expect(api.calls).toHaveLength(1)
  })
  it('sends nothing for no Tags or an empty list', async () => {
    const api = mockApi({ 'GET /api/recipes': [] })
    await recipesApi.list({ tags: [] })
    await recipesApi.list({})
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes', '/api/recipes'])
  })
  it('combines the Tags with the other filters', async () => {
    const api = mockApi({ 'GET /api/recipes?q=pie&tag=fish&tag=oven&archived=all&course=2': [] })
    await recipesApi.list({ q: 'pie', tags: ['fish', 'oven'], archived: 'all', course: 2 })
    expect(api.calls).toHaveLength(1)
  })
})

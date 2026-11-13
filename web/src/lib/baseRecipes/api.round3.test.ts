import { describe, expect, it } from 'vitest'
import { baseRecipesApi } from './api'
import { mockApi } from './test-utils'

// BR-D round 3: Use as a plain Ingredient with the User's choice.
describe('baseRecipesApi.unlinkLine with an Ingredient', () => {
  it('sends { ingredientId } as the DELETE body', async () => {
    const api = mockApi({ 'DELETE /api/recipes/7/lines/70/base': { id: 7 } })
    await baseRecipesApi.unlinkLine(7, 70, 5)
    expect(api.callsTo('DELETE', '/api/recipes/7/lines/70/base')[0]?.body).toEqual({ ingredientId: 5 })
  })
  it('sends no body without one (back to the remembered Ingredient)', async () => {
    const api = mockApi({ 'DELETE /api/recipes/7/lines/70/base': { id: 7 } })
    await baseRecipesApi.unlinkLine(7, 70)
    expect(api.callsTo('DELETE', '/api/recipes/7/lines/70/base')[0]?.body).toBeUndefined()
  })
})

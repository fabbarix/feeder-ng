// CRS E2: the Recipes API client for Courses (docs/dev/design/crs-e2.md 2.1).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../settings/test-utils'
import { recipesApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('recipesApi list with a Course', () => {
  it('sends ?course=<id>', async () => {
    const api = mockApi({ 'GET /api/recipes?course=2': [] })
    await recipesApi.list({ course: 2 })
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes?course=2'])
  })
  it('combines it with the other filters', async () => {
    const api = mockApi({ 'GET /api/recipes?q=rice&tag=quick&archived=all&course=2': [] })
    await recipesApi.list({ q: 'rice', tags: ['quick'], archived: 'all', course: 2 })
    expect(api.calls).toHaveLength(1)
  })
  it('sends nothing for no Course', async () => {
    const api = mockApi({ 'GET /api/recipes': [] })
    await recipesApi.list({})
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes'])
  })
})

describe('recipesApi slotRules and mealSlots', () => {
  it('reads every Slot Rule, with its Course', async () => {
    const rules = [{ id: 1, mealSlotId: 5, courseId: 2, recipeId: 3, recipeName: 'rice' }]
    const api = mockApi({ 'GET /api/slot-rules': rules })
    await expect(recipesApi.slotRules()).resolves.toEqual(rules)
    expect(api.calls).toHaveLength(1)
  })
  it('reads the Meal Slots', async () => {
    mockApi({ 'GET /api/meal-slots': [{ id: 5, weekday: 5, name: 'Dinner', time: '19:00' }] })
    const slots = await recipesApi.mealSlots()
    expect(slots[0]).toMatchObject({ id: 5, weekday: 5, name: 'Dinner' })
  })
})

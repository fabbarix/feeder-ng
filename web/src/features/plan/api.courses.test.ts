// CRS F: the plan routes per Course (docs/dev/design/crs-c2.md section 3). Without a courseId the course-less alias is used.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planApi } from './api'
import { mockApi } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

const side = { date: '2026-11-10', mealSlotId: 2, courseId: 3 }
const alias = { date: '2026-11-10', mealSlotId: 2 }

describe('planApi with a Course', () => {
  it.each([
    ['setMeal', () => planApi.setMeal(side, 8), 'PUT', '/api/plan/2026-11-10/2/3'],
    ['confirm', () => planApi.confirm(side), 'POST', '/api/plan/2026-11-10/2/3/confirm'],
    ['unpin', () => planApi.unpin(side), 'POST', '/api/plan/2026-11-10/2/3/unpin'],
    ['alternatives', () => planApi.alternatives(side), 'GET', '/api/plan/2026-11-10/2/3/alternatives'],
    ['cookPreview', () => planApi.cookPreview(side), 'GET', '/api/plan/2026-11-10/2/3/cook'],
    ['cooked', () => planApi.cooked(side, 1), 'POST', '/api/plan/2026-11-10/2/3/cooked'],
    ['notCooked', () => planApi.notCooked(side), 'POST', '/api/plan/2026-11-10/2/3/not-cooked'],
  ])('%s goes to the Course route', async (_name, call, method, path) => {
    const api = mockApi({ [`${method} ${path}`]: { alternatives: [] } })
    await call()
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([`${method} ${path}`])
  })
})

describe('planApi without a Course (the alias for the main Course, until C3)', () => {
  it('uses the course-less paths', async () => {
    const api = mockApi({
      'PUT /api/plan/2026-11-10/2': {}, 'POST /api/plan/2026-11-10/2/confirm': {}, 'POST /api/plan/2026-11-10/2/not-cooked': {},
    })
    await planApi.setMeal(alias, 8)
    await planApi.confirm(alias)
    await planApi.notCooked(alias)
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /api/plan/2026-11-10/2', 'POST /api/plan/2026-11-10/2/confirm', 'POST /api/plan/2026-11-10/2/not-cooked'])
  })
})

describe('the slot-wide routes', () => {
  it('cookedAll POSTs { courses } to .../all/cooked, whatever courseId the key carries', async () => {
    const result = { meals: [], leftovers: [], warnings: [], plannedFor: [] }
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/all/cooked': result })
    expect(await planApi.cookedAll(alias, [{ courseId: 1, leftoverPortions: 1.5 }, { courseId: 3, leftoverPortions: 0 }])).toEqual(result)
    expect(api.calls[0]!.body).toEqual({ courses: [{ courseId: 1, leftoverPortions: 1.5 }, { courseId: 3, leftoverPortions: 0 }] })
  })

  it('cookedAll without entries sends an empty body (every Course uses its proposal)', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/all/cooked': { meals: [], leftovers: [], warnings: [], plannedFor: [] } })
    await planApi.cookedAll(alias)
    expect(api.calls[0]!.body ?? {}).toEqual({})
  })

  it('notCookedAll POSTs .../all/not-cooked with no body and answers { meals }', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/all/not-cooked': { meals: [] } })
    expect(await planApi.notCookedAll(alias)).toEqual({ meals: [] })
    expect(api.calls[0]!.body).toBeUndefined()
  })
})

describe('Recipes for a Course', () => {
  const recipes = [{ id: 8, name: 'Green beans', tags: [], courses: [{ id: 3, name: 'Side' }] }, { id: 9, name: 'Soup', courses: [] }]

  it('asks for the Recipes marked with the Course', async () => {
    const api = mockApi({ 'GET /api/recipes?course=3': recipes })
    await planApi.recipeChoices(3)
    expect(api.calls.map((c) => c.path)).toEqual(['/api/recipes?course=3'])
  })

  it('keeps the Course ids of every Recipe for the Slot Rule form', async () => {
    mockApi({ 'GET /api/recipes': recipes })
    const choices = await planApi.recipeChoices()
    expect(choices.map((c) => c.courseIds)).toEqual([[3], []])
  })
})

describe('Slot Rules', () => {
  it('POST sends the Course next to the Meal Slot', async () => {
    const api = mockApi({ 'POST /api/slot-rules': { id: 1, mealSlotId: 2, courseId: 3, recipeId: 8 } })
    await planApi.addSlotRule({ mealSlotId: 2, courseId: 3, recipeId: 8 })
    expect(api.calls[0]!.body).toEqual({ mealSlotId: 2, courseId: 3, recipeId: 8 })
  })
})

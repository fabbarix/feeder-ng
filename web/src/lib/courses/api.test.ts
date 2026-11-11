// The Courses API client (CRS D2): one call per route of functional-spec section 16.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../http'
import { mockApi } from '../../features/settings/test-utils'
import { coursesApi } from './api'

afterEach(() => vi.unstubAllGlobals())

const row = { id: 2, name: 'Side', position: 1, main: false, archived: false, recipeCount: 8, mealSlotCount: 3, planned: true }

describe('coursesApi', () => {
  it('list unwraps { courses } and asks for archived ones only when told to', async () => {
    const api = mockApi({ 'GET /api/courses': { courses: [row] }, 'GET /api/courses?archived=1': { courses: [row, { ...row, id: 5, archived: true }] } })
    expect(await coursesApi.list(false)).toEqual([row])
    expect(await coursesApi.list(true)).toHaveLength(2)
    expect(api.calls.map((c) => c.path)).toEqual(['/api/courses', '/api/courses?archived=1'])
  })

  it('create POSTs { name } and answers the Course', async () => {
    const api = mockApi({ 'POST /api/courses': { status: 201, json: row } })
    expect(await coursesApi.create('Side')).toEqual(row)
    expect(api.callsTo('POST', '/api/courses')[0]!.body).toEqual({ name: 'Side' })
  })

  it('update PATCHes only what is given: a name, or main: true', async () => {
    const api = mockApi({ 'PATCH /api/courses/2': row })
    await coursesApi.update(2, { name: 'Sides' })
    await coursesApi.update(2, { main: true })
    expect(api.callsTo('PATCH', '/api/courses/2').map((c) => c.body)).toEqual([{ name: 'Sides' }, { main: true }])
  })

  it('reorder PUTs { ids } and answers the list unwrapped', async () => {
    const api = mockApi({ 'PUT /api/courses/order': { courses: [row] } })
    expect(await coursesApi.reorder([2, 1, 3, 4])).toEqual([row])
    expect(api.callsTo('PUT', '/api/courses/order')[0]!.body).toEqual({ ids: [2, 1, 3, 4] })
  })

  it('impact GETs the Course impact', async () => {
    const impact = { planned: true, recipes: 8, recipesOnlyThis: 3, mealSlots: 3, mealSlotsOnlyThis: 2, plannedMeals: [], slotRules: [] }
    mockApi({ 'GET /api/courses/2/impact': impact })
    expect(await coursesApi.impact(2)).toEqual(impact)
  })

  it('remove DELETEs, with ?replacement= only when one is given', async () => {
    const api = mockApi({ 'DELETE /api/courses/2': { status: 204 }, 'DELETE /api/courses/2?replacement=1': { status: 204 } })
    await coursesApi.remove(2)
    await coursesApi.remove(2, 1)
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/courses/2', 'DELETE /api/courses/2?replacement=1'])
  })

  it('archive POSTs { replacementId }, the key left out when there is none', async () => {
    const api = mockApi({ 'POST /api/courses/2/archive': { ...row, archived: true } })
    await coursesApi.archive(2, 1)
    await coursesApi.archive(2)
    expect(api.callsTo('POST', '/api/courses/2/archive').map((c) => c.body)).toEqual([{ replacementId: 1 }, {}])
  })

  it('unarchive POSTs to the Course', async () => {
    const api = mockApi({ 'POST /api/courses/5/unarchive': { ...row, id: 5 } })
    expect((await coursesApi.unarchive(5)).id).toBe(5)
    expect(api.callsTo('POST', '/api/courses/5/unarchive')).toHaveLength(1)
  })

  it('rejects with the ApiError of a refusal, details included', async () => {
    mockApi({ 'DELETE /api/courses/2': { status: 409, json: { error: { code: 'course_planned', message: 'Side has been planned' } } } })
    await expect(coursesApi.remove(2)).rejects.toMatchObject({ status: 409, code: 'course_planned' })
    await expect(coursesApi.remove(2)).rejects.toBeInstanceOf(ApiError)
  })
})

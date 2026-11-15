// B9-26 (B9-11 contracts): the routes of Undo: restore, reopen and reopen all; the writes answer `changes` and `undoToken`.
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/http'
import { planApi } from './api'
import { meal, mockApi } from './test-utils'

const key = { date: '2026-11-14', mealSlotId: 3, courseId: 2 }
const changes = [{ date: '2026-11-17', mealSlotId: 2, courseId: 1, before: null, after: { recipeId: 2, recipeName: 'Chicken curry', servedFromLeftover: false }, why: [] }]

describe('planApi.restore', () => {
  it('POSTs the token to /api/plan/restore and answers the cells it put back', async () => {
    const api = mockApi({ 'POST /api/plan/restore': { changes } })
    await expect(planApi.restore('tok-1')).resolves.toEqual({ changes })
    expect(api.calls).toEqual([{ method: 'POST', path: '/api/plan/restore', body: { undoToken: 'tok-1' } }])
  })

  it('a stale token is the ApiError plan_changed (409), a used one not_found (404)', async () => {
    mockApi({ 'POST /api/plan/restore': { status: 409, json: { error: { code: 'plan_changed', message: 'The plan changed' } } } })
    await expect(planApi.restore('old')).rejects.toMatchObject({ status: 409, code: 'plan_changed' })
    mockApi({ 'POST /api/plan/restore': { status: 404, json: { error: { code: 'not_found', message: 'gone' } } } })
    await expect(planApi.restore('used')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('planApi.reopen and reopenAll', () => {
  it('reopen POSTs the Course route and answers the meals and the Stock Lots already gone', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-14/3/2/reopen': { meals: [meal({ courseId: 2 })], stockGone: 1 } })
    const res = await planApi.reopen(key)
    expect(res.stockGone).toBe(1)
    expect(res.meals).toHaveLength(1)
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/plan/2026-11-14/3/2/reopen'])
  })

  it('reopenAll POSTs the slot-wide route', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-14/3/all/reopen': { meals: [], stockGone: 0 } })
    await planApi.reopenAll({ date: '2026-11-14', mealSlotId: 3 })
    expect(api.calls.map((c) => c.path)).toEqual(['/api/plan/2026-11-14/3/all/reopen'])
  })

  it('the refusals are the ApiError codes leftover_used and reopen_window_over (409)', async () => {
    mockApi({ 'POST /api/plan/2026-11-14/3/2/reopen': { status: 409, json: { error: { code: 'leftover_used', message: 'used' } } } })
    await expect(planApi.reopen(key)).rejects.toMatchObject({ status: 409, code: 'leftover_used' })
    mockApi({ 'POST /api/plan/2026-11-14/3/2/reopen': { status: 409, json: { error: { code: 'reopen_window_over', message: 'late' } } } })
    await expect(planApi.reopen(key)).rejects.toMatchObject({ code: 'reopen_window_over' })
  })

  it('a key without its Course is refused before any request', async () => {
    const api = mockApi({})
    expect(() => planApi.reopen({ date: '2026-11-14', mealSlotId: 3 } as never)).toThrow()
    expect(api.calls).toHaveLength(0)
  })
})

describe('the writes answer changes and an undoToken (B9-11)', () => {
  it('setMeal, pin and unpin hand the answer on as it is', async () => {
    const answer = { ...meal({ recipeId: 9 }), changes, undoToken: 'tok-2' }
    mockApi({ 'PUT /api/plan/2026-11-14/3/2': answer, 'POST /api/plan/2026-11-14/3/2/confirm': answer, 'POST /api/plan/2026-11-14/3/2/unpin': answer })
    await expect(planApi.setMeal(key, 9)).resolves.toMatchObject({ undoToken: 'tok-2', changes })
    await expect(planApi.confirm(key)).resolves.toMatchObject({ undoToken: 'tok-2' })
    await expect(planApi.unpin(key)).resolves.toMatchObject({ undoToken: 'tok-2' })
  })

  it('Regenerate answers { placed, kept, unfilled, changed, changes, undoToken }', async () => {
    const answer = { placed: 3, kept: 2, unfilled: 0, changed: 18, changes, undoToken: 'tok-3' }
    mockApi({ 'POST /api/plan/regenerate': answer })
    await expect(planApi.regenerate()).resolves.toEqual(answer)
  })
})

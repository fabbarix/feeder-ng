import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../features/settings/test-utils'
import { leftoversApi } from './api'
import { frozenChilli, leftover } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

describe('leftoversApi', () => {
  it('list GETs /api/plan/leftovers and unwraps { leftovers }', async () => {
    mockApi({ 'GET /api/plan/leftovers': { leftovers: [leftover()] } })
    expect(await leftoversApi.list()).toEqual([leftover()])
  })
  it('hadIt POSTs the portions and keeps replanned', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/had-it': { ...leftover({ portions: 1 }), replanned: [{ date: '2026-11-13', mealSlotId: 2 }] } })
    const out = await leftoversApi.hadIt(1, 2)
    expect(api.calls[0]!.body).toEqual({ portions: 2 })
    expect(out.portions).toBe(1)
    expect(out.replanned).toHaveLength(1)
  })
  it('replanned defaults to an empty list when the server leaves it out', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/threw-out': leftover({ portions: 0 }) })
    expect((await leftoversApi.threwOut(1, 3)).replanned).toEqual([])
  })
  it('threwOut POSTs the portions', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/threw-out': { ...leftover(), replanned: [] } })
    await leftoversApi.threwOut(1, 3)
    expect(api.calls[0]!.body).toEqual({ portions: 3 })
  })
  it('freeze POSTs the Storage Place and portions and returns the frozen part and what is left', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/freeze': { frozen: frozenChilli({ portions: 2 }), left: leftover({ portions: 1 }), replanned: [] } })
    const out = await leftoversApi.freeze(1, 2, 2)
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: 2, portions: 2 })
    expect(out.frozen.portions).toBe(2)
    expect(out.left?.portions).toBe(1)
  })
  it('takeOut POSTs the Storage Place, null for Not sorted', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/5/take-out': { ...leftover({ id: 5 }), replanned: [] } })
    await leftoversApi.takeOut(5, null)
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: null })
  })
  it('answer POSTs the answer and resolves on 204', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/answer': { status: 204 } })
    await expect(leftoversApi.answer(1, 'wasnt_there')).resolves.toBeUndefined()
    expect(api.calls[0]!.body).toEqual({ answer: 'wasnt_there' })
  })
})

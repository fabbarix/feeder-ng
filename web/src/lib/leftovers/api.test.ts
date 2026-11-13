import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../features/settings/test-utils'
import { leftoversApi } from './api'
import { friDinner, friLunch, frozenChilli, leftover } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

describe('leftoversApi', () => {
  it('list GETs /api/plan/leftovers and unwraps { leftovers }', async () => {
    mockApi({ 'GET /api/plan/leftovers': { leftovers: [leftover()] } })
    expect(await leftoversApi.list()).toEqual([leftover()])
  })
  it('hadIt POSTs the portions and returns { leftover, replanned }', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/had-it': { leftover: leftover({ portions: 1 }), replanned: [friLunch] } })
    const out = await leftoversApi.hadIt(1, 2)
    expect(api.calls[0]!.body).toEqual({ portions: 2 })
    expect(out.leftover.portions).toBe(1)
    expect(out.replanned).toEqual([friLunch])
  })
  it('replanned is never null: an absent or null list becomes []', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/threw-out': { leftover: leftover({ portions: 0 }), replanned: null } })
    expect((await leftoversApi.threwOut(1, 3)).replanned).toEqual([])
  })
  it('threwOut POSTs the portions and returns { leftover, replanned }', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/threw-out': { leftover: leftover({ portions: 0 }), replanned: [] } })
    const out = await leftoversApi.threwOut(1, 3)
    expect(api.calls[0]!.body).toEqual({ portions: 3 })
    expect(out.leftover.portions).toBe(0)
  })
  it('freeze POSTs the Storage Place and portions and returns { frozen, left, replanned }', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/freeze': { frozen: frozenChilli({ portions: 2 }), left: leftover({ portions: 1 }), replanned: [friLunch] } })
    const out = await leftoversApi.freeze(1, 2, 2)
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: 2, portions: 2 })
    expect(out.frozen.portions).toBe(2)
    expect(out.left?.portions).toBe(1)
    expect(out.replanned).toEqual([friLunch])
  })
  it('freeze keeps left null when all of it was frozen', async () => {
    mockApi({ 'POST /api/plan/leftovers/1/freeze': { frozen: frozenChilli(), left: null, replanned: [] } })
    expect((await leftoversApi.freeze(1, 2, 3)).left).toBeNull()
  })
  it('takeOut POSTs the Storage Place (null for Not sorted) and returns the flat Leftover', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/5/take-out': leftover({ id: 5, useBy: '2026-11-15' }) })
    const out = await leftoversApi.takeOut(5, null)
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: null })
    expect(out.id).toBe(5)
    expect(out.useBy).toBe('2026-11-15')
  })
  it('preview POSTs had-it with ?dryRun=1 and returns the Planned Meals that would lose portions', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/had-it?dryRun=1': { replanned: [friLunch] } })
    expect(await leftoversApi.preview(1, { kind: 'had-it', portions: 2 })).toEqual([friLunch])
    expect(api.calls[0]!.body).toEqual({ portions: 2 })
  })
  it('preview threw-out and freeze use their own route and body', async () => {
    const api = mockApi({
      'POST /api/plan/leftovers/1/threw-out?dryRun=1': { replanned: [] },
      'POST /api/plan/leftovers/1/freeze?dryRun=1': { replanned: [friDinner] },
    })
    expect(await leftoversApi.preview(1, { kind: 'threw-out', portions: 3 })).toEqual([])
    expect(await leftoversApi.preview(1, { kind: 'freeze', storagePlaceId: 2, portions: 1 })).toEqual([friDinner])
    expect(api.calls.map((c) => c.body)).toEqual([{ portions: 3 }, { storagePlaceId: 2, portions: 1 }])
  })
  it('answer POSTs the answer and resolves on 204', async () => {
    const api = mockApi({ 'POST /api/plan/leftovers/1/answer': { status: 204 } })
    await expect(leftoversApi.answer(1, 'wasnt_there')).resolves.toBeUndefined()
    expect(api.calls[0]!.body).toEqual({ answer: 'wasnt_there' })
  })
})

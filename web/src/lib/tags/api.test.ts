// tagsApi: the routes of spec 17.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tagsApi } from './api'

afterEach(() => vi.unstubAllGlobals())

function stub(reply: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => new Response(reply === undefined ? null : JSON.stringify(reply), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const call = (m: ReturnType<typeof stub>) => ({ url: m.mock.calls[0]![0], method: m.mock.calls[0]![1]?.method ?? 'GET', body: m.mock.calls[0]![1]?.body ? JSON.parse(String(m.mock.calls[0]![1]!.body)) : undefined })

describe('tagsApi', () => {
  it('list: GET /api/tags', async () => {
    const m = stub([{ id: 1, name: 'Fish' }])
    await expect(tagsApi.list()).resolves.toEqual([{ id: 1, name: 'Fish' }])
    expect(call(m)).toMatchObject({ url: '/api/tags', method: 'GET' })
  })
  it('create: POST /api/tags with name and optional colour', async () => {
    const m = stub({ id: 2 }, 201)
    await tagsApi.create({ name: 'Soup', colour: 'sage' })
    expect(call(m)).toEqual({ url: '/api/tags', method: 'POST', body: { name: 'Soup', colour: 'sage' } })
  })
  it('update: PATCH /api/tags/{id}', async () => {
    const m = stub({ id: 2 })
    await tagsApi.update(2, { colour: 'rose' })
    expect(call(m)).toEqual({ url: '/api/tags/2', method: 'PATCH', body: { colour: 'rose' } })
  })
  it('impact: GET /api/tags/{id}/impact', async () => {
    const m = stub({ recipes: 1, slotRules: [], varietyRule: null })
    await expect(tagsApi.impact(3)).resolves.toEqual({ recipes: 1, slotRules: [], varietyRule: null })
    expect(call(m)).toMatchObject({ url: '/api/tags/3/impact', method: 'GET' })
  })
  it('merge: POST /api/tags/{id}/merge with { into }', async () => {
    const m = stub({ id: 4 })
    await tagsApi.merge(3, 4)
    expect(call(m)).toEqual({ url: '/api/tags/3/merge', method: 'POST', body: { into: 4 } })
  })
  it('remove: DELETE /api/tags/{id}', async () => {
    const m = stub(undefined, 204)
    await tagsApi.remove(3)
    expect(call(m)).toMatchObject({ url: '/api/tags/3', method: 'DELETE' })
  })
})

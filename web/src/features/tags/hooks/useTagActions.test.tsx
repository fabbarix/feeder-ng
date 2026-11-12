// useTagActions: the writes (each one refreshes the four Tag caches) and the two summaries the confirms read.
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { fish, fishImpact, fishIntoSeafood, roastImpact, seafood, seafoodImpact, tagRow } from '../fixtures'
import { mockApi, TAG_KEYS, tagsHarness } from '../test-utils'
import { useTagActions } from './useTagActions'

afterEach(() => vi.unstubAllGlobals())

function setup(handlers: Record<string, unknown>) {
  const api = mockApi(handlers)
  const { client, wrapper } = tagsHarness()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const view = renderHook(() => useTagActions(), { wrapper })
  const invalidated = () => spy.mock.calls.map((c) => c[0]?.queryKey)
  return { api, view, invalidated }
}

describe('useTagActions: writes', () => {
  it('create POSTs the name and colour and refreshes the four caches', async () => {
    const { api, view, invalidated } = setup({ 'POST /api/tags': { status: 201, json: tagRow(9, 'Soup', { colour: 'mustard' }) } })
    let created
    await act(async () => {
      created = await view.result.current.create({ name: 'Soup', colour: 'mustard' })
    })
    expect(created).toMatchObject({ id: 9, name: 'Soup' })
    expect(api.callsTo('POST', '/api/tags')[0]?.body).toEqual({ name: 'Soup', colour: 'mustard' })
    expect(invalidated()).toEqual(TAG_KEYS)
  })

  it('update PATCHes only what it is given and refreshes the four caches', async () => {
    const { api, view, invalidated } = setup({ 'PATCH /api/tags/1': { json: { ...fish, colour: 'rose' } } })
    await act(async () => {
      await view.result.current.update(1, { colour: 'rose' })
    })
    expect(api.callsTo('PATCH', '/api/tags/1')[0]?.body).toEqual({ colour: 'rose' })
    expect(invalidated()).toEqual(TAG_KEYS)
  })

  it('merge POSTs { into } and refreshes the four caches', async () => {
    const { api, view, invalidated } = setup({ 'POST /api/tags/1/merge': { json: seafood } })
    await act(async () => {
      await view.result.current.merge(1, 3)
    })
    expect(api.callsTo('POST', '/api/tags/1/merge')[0]?.body).toEqual({ into: 3 })
    expect(invalidated()).toEqual(TAG_KEYS)
  })

  it('remove DELETEs and refreshes the four caches', async () => {
    const { api, view, invalidated } = setup({ 'DELETE /api/tags/1': { status: 204 } })
    await act(async () => {
      await view.result.current.remove(1)
    })
    expect(api.callsTo('DELETE', '/api/tags/1')).toHaveLength(1)
    expect(invalidated()).toEqual(TAG_KEYS)
  })

  it('a refused write rejects with its ApiError and refreshes nothing', async () => {
    const { view, invalidated } = setup({ 'PATCH /api/tags/1': { status: 409, json: { error: { code: 'tag_name_taken', message: 'taken', tag: { id: 3, name: 'Seafood', colour: 'teal' } } } } })
    let error: unknown
    await act(async () => {
      error = await view.result.current.update(1, { name: 'seafood' }).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('tag_name_taken')
    expect((error as ApiError).details['tag']).toEqual({ id: 3, name: 'Seafood', colour: 'teal' })
    expect(invalidated()).toEqual([])
  })
})

describe('useTagActions: summaries', () => {
  it('mergeSummaryFor reads both impacts (the source with ?into=) and folds them with bothRecipes', async () => {
    const { api, view } = setup({ 'GET /api/tags/1/impact?into=3': fishIntoSeafood, 'GET /api/tags/3/impact': seafoodImpact })
    let summary
    await act(async () => {
      summary = await view.result.current.mergeSummaryFor(fish, seafood)
    })
    expect(summary).toMatchObject({ source: 'fish', target: 'Seafood', recipes: 12, bothRecipes: 4, varietyRule: 'goes' })
    expect((summary as unknown as { movedRules: unknown[] }).movedRules).toHaveLength(1)
    expect(api.calls.map((c) => c.path).sort()).toEqual(['/api/tags/1/impact?into=3', '/api/tags/3/impact'])
    expect(api.calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('a missing bothRecipes is 0', async () => {
    const { view } = setup({ 'GET /api/tags/1/impact?into=3': fishImpact, 'GET /api/tags/3/impact': seafoodImpact })
    let summary
    await act(async () => {
      summary = await view.result.current.mergeSummaryFor(fish, seafood)
    })
    expect(summary).toMatchObject({ bothRecipes: 0 })
  })

  it('mergeSummaryFor rejects when an impact cannot be read', async () => {
    const { view } = setup({ 'GET /api/tags/1/impact?into=3': { status: 500, json: { error: { code: 'internal', message: 'boom' } } }, 'GET /api/tags/3/impact': seafoodImpact })
    let error: unknown
    await act(async () => {
      error = await view.result.current.mergeSummaryFor(fish, seafood).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ApiError)
  })

  it('deleteSummaryFor reads the impact and folds it with deleteSummary', async () => {
    const { api, view } = setup({ 'GET /api/tags/1/impact': fishImpact, 'GET /api/tags/4/impact': roastImpact })
    let summary
    await act(async () => {
      summary = await view.result.current.deleteSummaryFor(fish)
    })
    expect(summary).toMatchObject({ name: 'fish', recipes: 12, hasRules: true })
    await act(async () => {
      summary = await view.result.current.deleteSummaryFor(tagRow(4, 'Roast'))
    })
    expect(summary).toMatchObject({ name: 'Roast', recipes: 0, hasRules: false, varietyRule: null })
    expect(api.calls.map((c) => c.path)).toEqual(['/api/tags/1/impact', '/api/tags/4/impact'])
  })

  it('summaries refresh nothing', async () => {
    const { view, invalidated } = setup({ 'GET /api/tags/1/impact': fishImpact })
    await act(async () => {
      await view.result.current.deleteSummaryFor(fish)
    })
    expect(invalidated()).toEqual([])
  })
})

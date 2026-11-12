// WP-E/G: the Recipe Assistant reads calls and Confirm's `photo` (ai-recipe-import.md section 7).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, string, unknown?, unknown?]> = []
vi.mock('../../lib/http', () => {
  const rec = (m: string) => async (path: string, a?: unknown, b?: unknown) => {
    calls.push(m === 'GET' || m === 'DELETE' ? [m, path, undefined, a] : [m, path, a, b])
    return {}
  }
  return { http: { get: rec('GET'), post: rec('POST'), put: rec('PUT'), patch: rec('PATCH'), delete: rec('DELETE') } }
})

import { importApi } from './api'

const none = { ingredients: [], conversions: [], recipes: [], courses: [] }

describe('importApi: Recipe Assistant reads', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('assistantStatus is GET /api/recipe-assistant/status', async () => {
    await importApi.assistantStatus()
    expect(calls.map((c) => c.slice(0, 2))).toEqual([['GET', '/api/recipe-assistant/status']])
  })
  it('startRead posts the body as it is', async () => {
    await importApi.startRead({ text: 'Soup' })
    await importApi.startRead({ photos: [{ dataUrl: 'data:image/jpeg;base64,AA' }, { url: 'https://example.com/a.jpg' }] })
    expect(calls).toEqual([
      ['POST', '/api/recipe-assistant/reads', { text: 'Soup' }, undefined],
      ['POST', '/api/recipe-assistant/reads', { photos: [{ dataUrl: 'data:image/jpeg;base64,AA' }, { url: 'https://example.com/a.jpg' }] }, undefined],
    ])
  })
  it('getRead encodes the id and passes the abort signal', async () => {
    const signal = new AbortController().signal
    await importApi.getRead('a/b', { signal })
    expect(calls).toEqual([['GET', '/api/recipe-assistant/reads/a%2Fb', undefined, { signal }]])
  })
  it('cancelRead is DELETE on the read', async () => {
    await importApi.cancelRead('rd 1')
    expect(calls.map((c) => c.slice(0, 2))).toEqual([['DELETE', '/api/recipe-assistant/reads/rd%201']])
  })
})

describe('importApi.cancelRead with keepalive', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('passes keepalive on to the DELETE (the unmount path)', async () => {
    await importApi.cancelRead('rd1', { keepalive: true })
    expect(calls).toEqual([['DELETE', '/api/recipe-assistant/reads/rd1', undefined, { keepalive: true }]])
  })
})

describe('importApi.confirm with a photo', () => {
  beforeEach(() => {
    calls.length = 0
  })
  it('sends { decisions, photo: { index, recipe } } when a photo is chosen', async () => {
    await importApi.confirm('imp1', none, { index: 1, recipe: 0 })
    expect(calls).toEqual([['POST', '/api/imports/imp1/confirm', { decisions: none, photo: { index: 1, recipe: 0 } }, undefined]])
  })
  it('sends no `photo` key at all without one', async () => {
    await importApi.confirm('imp1', none)
    await importApi.confirm('imp1', none, undefined)
    for (const c of calls) expect(Object.keys(c[2] as object)).toEqual(['decisions'])
  })
})

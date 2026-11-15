import { describe, expect, it } from 'vitest'
import { ApiError } from './http'
import { GET_TIMEOUT_MS, queryDefaults, RETRY_DELAY_MS, retryPolicy, screenState, type QueryShape, type ScreenState } from './dataState'

// B9-20 (RES-02): "Unknown is not empty." One state for every data screen.
const q = (over: Partial<QueryShape> = {}): QueryShape => ({ data: undefined, isError: false, fetchStatus: 'fetching', ...over })
const o = (over: Partial<{ online: boolean; isEmpty: boolean; hasFilter: boolean }> = {}) => ({ online: true, isEmpty: false, hasFilter: false, ...over })
const rows = [{ id: 1 }]

describe('screenState: the seven states', () => {
  const cases: Array<[string, QueryShape, ReturnType<typeof o>, ScreenState]> = [
    ['no data yet, fetching, online: loading', q(), o(), 'loading'],
    ['no data, the retry is waiting, online: still loading', q({ isError: false, fetchStatus: 'paused' }), o(), 'loading'],
    ['data, online: ready', q({ data: rows, fetchStatus: 'idle' }), o(), 'ready'],
    ['data while a background refetch runs: ready, never loading', q({ data: rows, fetchStatus: 'fetching' }), o(), 'ready'],
    ['data, a refetch failed over it, online: ready (the data stays)', q({ data: rows, isError: true, fetchStatus: 'idle' }), o(), 'ready'],
    ['a successful empty answer, no filter: empty', q({ data: [], fetchStatus: 'idle' }), o({ isEmpty: true }), 'empty'],
    ['a successful empty answer under a search or filter: filteredEmpty', q({ data: [], fetchStatus: 'idle' }), o({ isEmpty: true, hasFilter: true }), 'filteredEmpty'],
    ['data, offline: offlineSaved', q({ data: rows, fetchStatus: 'idle' }), o({ online: false }), 'offlineSaved'],
    ['no data, the query is paused, offline: offlineUnknown, never empty', q({ fetchStatus: 'paused' }), o({ online: false }), 'offlineUnknown'],
    ['no data, offline, the one offlineFirst run failed: offlineUnknown, not failed (Try again cannot work)', q({ isError: true, fetchStatus: 'idle' }), o({ online: false }), 'offlineUnknown'],
    ['no data, offline, still fetching: offlineUnknown', q({ fetchStatus: 'fetching' }), o({ online: false }), 'offlineUnknown'],
    ['no data, online, the request failed: failed', q({ isError: true, fetchStatus: 'idle' }), o(), 'failed'],
  ]
  it.each(cases)('%s', (_name, query, opts, want) => {
    expect(screenState(query, opts)).toBe(want)
  })

  it('"paused with no data" is offlineUnknown and never one of the empty states, whatever the caller passes for isEmpty or hasFilter', () => {
    for (const isEmpty of [false, true]) for (const hasFilter of [false, true]) {
      const s = screenState(q({ fetchStatus: 'paused' }), o({ online: false, isEmpty, hasFilter }))
      expect(s).toBe('offlineUnknown')
    }
  })

  it('without data, isEmpty is ignored online as well: it is loading or failed, never empty or filteredEmpty', () => {
    expect(screenState(q(), o({ isEmpty: true }))).toBe('loading')
    expect(screenState(q({ isError: true, fetchStatus: 'idle' }), o({ isEmpty: true, hasFilter: true }))).toBe('failed')
  })

  it('a saved copy that was empty is still empty offline (pinned choice): the data is known', () => {
    expect(screenState(q({ data: [], fetchStatus: 'idle' }), o({ online: false, isEmpty: true }))).toBe('empty')
    expect(screenState(q({ data: [], fetchStatus: 'idle' }), o({ online: false, isEmpty: true, hasFilter: true }))).toBe('filteredEmpty')
  })

  it('a non-array answer (an object, 0, an empty string) counts as data', () => {
    expect(screenState(q({ data: { slots: [] }, fetchStatus: 'idle' }), o())).toBe('ready')
    expect(screenState(q({ data: 0, fetchStatus: 'idle' }), o())).toBe('ready')
    expect(screenState(q({ data: '', fetchStatus: 'idle' }), o())).toBe('ready')
  })
})

describe('retryPolicy (RES-06): one retry, only for what a second try can fix', () => {
  it('retries a 500 once', () => {
    expect(retryPolicy(0, new ApiError(500, 'internal', 'x'))).toBe(true)
    expect(retryPolicy(1, new ApiError(500, 'internal', 'x'))).toBe(false)
  })
  it('retries 502, 503 and 504 once', () => {
    for (const status of [502, 503, 504]) {
      expect(retryPolicy(0, new ApiError(status, 'x', 'x'))).toBe(true)
      expect(retryPolicy(1, new ApiError(status, 'x', 'x'))).toBe(false)
    }
  })
  it('retries a network error (status 0) and a timeout once', () => {
    expect(retryPolicy(0, new ApiError(0, 'network', 'x'))).toBe(true)
    expect(retryPolicy(1, new ApiError(0, 'network', 'x'))).toBe(false)
    expect(retryPolicy(0, new ApiError(0, 'timeout', 'x'))).toBe(true)
    expect(retryPolicy(1, new ApiError(0, 'timeout', 'x'))).toBe(false)
  })
  it('never retries a 4xx: a 404, a 422, a 401, a 403, a 409', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) expect(retryPolicy(0, new ApiError(status, 'x', 'x'))).toBe(false)
  })
  it('never retries an error that is not an ApiError (a bug in the query function would only repeat)', () => {
    expect(retryPolicy(0, new Error('boom'))).toBe(false)
    expect(retryPolicy(0, 'text')).toBe(false)
    expect(retryPolicy(0, undefined)).toBe(false)
  })
})

describe('the numbers', () => {
  it('retries after 1 s and gives a GET 10 s', () => {
    expect(RETRY_DELAY_MS).toBe(1000)
    expect(GET_TIMEOUT_MS).toBe(10_000)
  })
  it('queryDefaults: queries offlineFirst with the policy and a flat 1 s; mutations offlineFirst and never retried', () => {
    expect(queryDefaults.queries).toMatchObject({ networkMode: 'offlineFirst', retry: retryPolicy, retryDelay: RETRY_DELAY_MS })
    expect(queryDefaults.mutations).toMatchObject({ networkMode: 'offlineFirst', retry: 0 })
  })
})

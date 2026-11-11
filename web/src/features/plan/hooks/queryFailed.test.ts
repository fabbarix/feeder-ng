import { describe, expect, it } from 'vitest'
import { queryFailed } from './queryFailed'

const q = (over: Partial<Parameters<typeof queryFailed>[0]>) => ({ data: undefined, isError: false, isPending: true, fetchStatus: 'idle', ...over })

describe('queryFailed', () => {
  it('is true when the fetch errored and nothing is held', () => {
    expect(queryFailed(q({ isError: true, isPending: false }))).toBe(true)
  })
  it('is true when the first fetch is paused for lack of a network (offline)', () => {
    expect(queryFailed(q({ fetchStatus: 'paused' }))).toBe(true)
  })
  it('is false while the first fetch is running', () => {
    expect(queryFailed(q({ fetchStatus: 'fetching' }))).toBe(false)
  })
  it('is false when data is held, even if errored or paused', () => {
    expect(queryFailed(q({ data: {}, isError: true, isPending: false }))).toBe(false)
    expect(queryFailed(q({ data: {}, isPending: false, fetchStatus: 'paused' }))).toBe(false)
  })
})

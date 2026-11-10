import { describe, expect, it } from 'vitest'
import { resolveStockStatus, type StatusInput } from './status'

const base: StatusInput = { isLoading: false, error: null, hasData: true, isEmpty: false, offline: false }
const err = new Error('boom')

describe('resolveStockStatus', () => {
  it.each<[string, Partial<StatusInput>, string]>([
    ['first fetch running', { isLoading: true, hasData: false }, 'loading'],
    ['data received', {}, 'ready'],
    ['data received and empty', { isEmpty: true }, 'empty'],
    ['failed online with nothing held', { error: err, hasData: false }, 'error'],
    ['failed because offline, nothing held', { error: err, hasData: false, offline: true }, 'offline'],
    ['offline, never fetched', { isLoading: true, hasData: false, offline: true }, 'offline'],
    ['offline with cached rows is still ready', { offline: true }, 'ready'],
    ['offline with a cached empty list is empty', { offline: true, isEmpty: true }, 'empty'],
    ['a background refetch failed but rows are held', { error: err }, 'ready'],
  ])('%s -> %s', (_name, over, expected) => {
    expect(resolveStockStatus({ ...base, ...over })).toBe(expected)
  })

  it('never reports empty for a failed request', () => {
    expect(resolveStockStatus({ ...base, error: err, hasData: false, isEmpty: true })).toBe('error')
  })
})

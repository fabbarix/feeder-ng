import { describe, expect, it } from 'vitest'
import { staleKeysFor } from './liveUpdates'

describe('staleKeysFor (topic "access")', () => {
  it('refreshes the list and the history when requests change', () => {
    expect(staleKeysFor({ changed: 'requests' })).toEqual([['access', 'requests'], ['access', 'history']])
  })
  it('ignores anything else', () => {
    expect(staleKeysFor({ changed: 'other' })).toEqual([])
    expect(staleKeysFor(null)).toEqual([])
    expect(staleKeysFor('requests')).toEqual([])
    expect(staleKeysFor({})).toEqual([])
  })
})

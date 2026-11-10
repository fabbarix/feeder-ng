import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCachedMe, ME_CACHE_KEY, readCachedMe, writeCachedMe } from './meCache'

const me = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: false }

beforeEach(() => localStorage.clear())

describe('meCache (the User\'s own profile, kept on this device for the offline shell)', () => {
  it('round-trips a User', () => {
    writeCachedMe(me)
    expect(readCachedMe()).toEqual(me)
  })

  it('is null when empty, corrupt or shaped wrong', () => {
    expect(readCachedMe()).toBeNull()
    localStorage.setItem(ME_CACHE_KEY, 'not json')
    expect(readCachedMe()).toBeNull()
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ id: 'x', email: 1 }))
    expect(readCachedMe()).toBeNull()
  })

  it('clear forgets it', () => {
    writeCachedMe(me)
    clearCachedMe()
    expect(readCachedMe()).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readCachedMe()).toBeNull()
    expect(() => writeCachedMe(me)).not.toThrow()
    expect(() => clearCachedMe()).not.toThrow()
    vi.restoreAllMocks()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCachedMe, ME_CACHE_KEY, readCachedMe, readCachedTimeZone, writeCachedMe } from './meCache'

// B9-20 (RES-05): the Household's zone is remembered with the User, so Today knows the date before the plan answers and offline.
const me = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: false }

beforeEach(() => localStorage.clear())

describe('meCache keeps householdTimeZone', () => {
  it('round-trips the zone with the User', () => {
    writeCachedMe({ ...me, householdTimeZone: 'Pacific/Kiritimati' })
    expect(readCachedMe()).toEqual({ ...me, householdTimeZone: 'Pacific/Kiritimati' })
    expect(readCachedTimeZone()).toBe('Pacific/Kiritimati')
  })

  it('a copy written by an older build (no zone) still reads as a User, with no zone', () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    expect(readCachedMe()).toEqual(me)
    expect(readCachedMe()!.householdTimeZone).toBeUndefined()
    expect(readCachedTimeZone()).toBeNull()
  })

  it('an invalid or mistyped zone is dropped, not trusted', () => {
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ ...me, householdTimeZone: 'Not/AZone' }))
    expect(readCachedTimeZone()).toBeNull()
    expect(readCachedMe()).toEqual(me)
    localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ ...me, householdTimeZone: 42 }))
    expect(readCachedTimeZone()).toBeNull()
  })

  it('is null when nothing is kept, and after the User is forgotten (sign-out leaves no zone behind)', () => {
    expect(readCachedTimeZone()).toBeNull()
    writeCachedMe({ ...me, householdTimeZone: 'UTC' })
    clearCachedMe()
    expect(readCachedTimeZone()).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readCachedTimeZone()).toBeNull()
    vi.restoreAllMocks()
  })
})

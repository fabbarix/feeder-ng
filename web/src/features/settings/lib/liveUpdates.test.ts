import { describe, expect, it } from 'vitest'
import { staleKeysFor } from './liveUpdates'

describe('staleKeysFor', () => {
  it('maps each change to the queries it affects', () => {
    expect(staleKeysFor({ changed: 'settings' })).toEqual([['household', 'settings']])
    expect(staleKeysFor({ changed: 'members' })).toEqual([['household', 'members'], ['household', 'meal-slots']])
    expect(staleKeysFor({ changed: 'attendance' })).toContainEqual(['household', 'attendance'])
  })

  it('CRS D2: a Courses change refreshes the Courses and the Meal Slots that name them', () => {
    expect(staleKeysFor({ changed: 'courses' })).toEqual([['courses'], ['household', 'meal-slots']])
  })

  it('ignores payloads it does not know', () => {
    expect(staleKeysFor(null)).toEqual([])
    expect(staleKeysFor('members')).toEqual([])
    expect(staleKeysFor({ changed: 'toString' })).toEqual([])
    expect(staleKeysFor({})).toEqual([])
  })
})

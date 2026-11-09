import { describe, expect, it } from 'vitest'
import { isExcluded, nextState, stateOf } from './preference'

describe('nextState', () => {
  it('sets a state from none', () => {
    expect(nextState('none', 'favourite')).toBe('favourite')
    expect(nextState('none', 'exclusion')).toBe('exclusion')
  })
  it('tapping the active state clears it', () => {
    expect(nextState('dislike', 'dislike')).toBe('none')
  })
  it('tapping another state replaces the current one', () => {
    expect(nextState('favourite', 'dislike')).toBe('dislike')
    expect(nextState('exclusion', 'favourite')).toBe('favourite')
  })
})

describe('stateOf / isExcluded', () => {
  it('reads the Member preferences', () => {
    expect(stateOf({ '4': 'favourite' }, 4)).toBe('favourite')
    expect(stateOf({ '4': 'favourite' }, 5)).toBe('none')
    expect(isExcluded([2, 9], 9)).toBe(true)
    expect(isExcluded([2, 9], 3)).toBe(false)
  })
})

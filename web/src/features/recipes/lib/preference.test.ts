import { describe, expect, it } from 'vitest'
import { exclusionSummary, isExcluded, nextState, stateOf } from './preference'

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

// A11Y 3: the Exclusions tile says in one line who excludes the Ingredient.
describe('exclusionSummary', () => {
  it('nobody: "Nobody excludes Flour."', () => {
    expect(exclusionSummary([], 'Flour')).toBe('Nobody excludes Flour.')
  })
  it('one Member: "Ben excludes Flour."', () => {
    expect(exclusionSummary(['Ben'], 'Flour')).toBe('Ben excludes Flour.')
  })
  it('two Members: "Ben and Chiara exclude Flour."', () => {
    expect(exclusionSummary(['Ben', 'Chiara'], 'Flour')).toBe('Ben and Chiara exclude Flour.')
  })
  it('three or more: the first two, then "N more": "Ben, Chiara and 2 more exclude Flour."', () => {
    expect(exclusionSummary(['Ben', 'Chiara', 'Dev', 'Eli'], 'Flour')).toBe('Ben, Chiara and 2 more exclude Flour.')
    expect(exclusionSummary(['Ben', 'Chiara', 'Dev'], 'Flour')).toBe('Ben, Chiara and 1 more exclude Flour.')
  })
  it('keeps the Members in the order given', () => {
    expect(exclusionSummary(['Chiara', 'Ben'], 'garlic')).toBe('Chiara and Ben exclude garlic.')
  })
})

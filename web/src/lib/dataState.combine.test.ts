import { describe, expect, it } from 'vitest'
import { combineScreenStates } from './dataState'

// B9-20 (RES-02): a screen that needs two answers (the Pantry's Storage Place view: the totals and the Lots).
describe('combineScreenStates', () => {
  it('is the primary state when every other answer is known', () => {
    expect(combineScreenStates('ready', 'ready')).toBe('ready')
    expect(combineScreenStates('empty', 'offlineSaved')).toBe('empty')
    expect(combineScreenStates('offlineSaved', 'empty')).toBe('offlineSaved')
  })
  it('an answer still unknown wins: offlineUnknown, then failed, then loading', () => {
    expect(combineScreenStates('ready', 'loading')).toBe('loading')
    expect(combineScreenStates('offlineSaved', 'offlineUnknown')).toBe('offlineUnknown')
    expect(combineScreenStates('loading', 'failed')).toBe('failed')
    expect(combineScreenStates('failed', 'offlineUnknown')).toBe('offlineUnknown')
  })
})

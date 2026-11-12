// CRS F (ADR 0009): the words of the relaxed chips. They say WHAT came round sooner, never a vague quality word.
import { describe, expect, it } from 'vitest'
import { phraseWhy } from './phrase'

const ctx = { slotDate: '2026-11-10' } // a Tuesday

describe('cooldown_relaxed', () => {
  it('names the nearest fresh cook before the slot: "Again soon: had Sun"', () => {
    expect(phraseWhy({ code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 7 }, ctx)).toBe('Again soon: had Sun')
  })

  it('names one after the slot: "Again soon: also on Thu"', () => {
    expect(phraseWhy({ code: 'cooldown_relaxed', date: '2026-11-12', recipeId: 7 }, ctx)).toBe('Again soon: also on Thu')
  })
})

describe('variety_relaxed', () => {
  it.each([
    [2, '2nd fish this week'],
    [3, '3rd fish this week'],
    [4, '4th fish this week'],
    [11, '11th fish this week'],
    [21, '21st fish this week'],
  ])('a count of %i reads "%s"', (value, text) => {
    expect(phraseWhy({ code: 'variety_relaxed', tag: 'fish', value }, ctx)).toBe(text)
  })

  it('an adjacent day reads "fish two days running"', () => {
    expect(phraseWhy({ code: 'variety_relaxed', tag: 'fish', date: '2026-11-09' }, ctx)).toBe('fish two days running')
  })
})

describe('best_available', () => {
  it('is never phrased (ADR 0009 retired it; an old stored chip is ignored)', () => {
    expect(phraseWhy({ code: 'best_available' }, ctx)).toBe('')
  })
})

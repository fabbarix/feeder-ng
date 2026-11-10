import { describe, expect, it } from 'vitest'
import { defaultReheatSeconds } from './reheat'

// R12 (user decision): a Recipe may carry its own reheat time in whole minutes (1 to 30). Reheat uses it when set,
// whatever the portions; otherwise it falls back to the formula (2 min + 1 min per extra portion, at most 10 min).
describe('defaultReheatSeconds with the Recipe reheat time', () => {
  it('uses the Recipe time in seconds when it is set', () => {
    expect(defaultReheatSeconds(2, 5)).toBe(300)
    expect(defaultReheatSeconds(1, 1)).toBe(60)
  })

  it('is flat: the number of portions does not change a Recipe time', () => {
    expect(defaultReheatSeconds(1, 4)).toBe(240)
    expect(defaultReheatSeconds(8, 4)).toBe(240)
  })

  it('may exceed the formula cap of 10 minutes (up to 30)', () => {
    expect(defaultReheatSeconds(2, 15)).toBe(900)
    expect(defaultReheatSeconds(2, 30)).toBe(1800)
  })

  it('falls back to the formula when the Recipe has none', () => {
    expect(defaultReheatSeconds(2)).toBe(180)
    expect(defaultReheatSeconds(2, undefined)).toBe(180)
    expect(defaultReheatSeconds(4, null as unknown as undefined)).toBe(300)
    expect(defaultReheatSeconds(9, undefined)).toBe(600)
  })

  it('ignores an unusable Recipe time (0, negative, not a number) and uses the formula', () => {
    expect(defaultReheatSeconds(2, 0)).toBe(180)
    expect(defaultReheatSeconds(2, -3)).toBe(180)
    expect(defaultReheatSeconds(2, Number.NaN)).toBe(180)
  })

  it('keeps a Recipe time inside the screen limits (30 s to 30 min)', () => {
    expect(defaultReheatSeconds(2, 45)).toBe(1800)
  })
})

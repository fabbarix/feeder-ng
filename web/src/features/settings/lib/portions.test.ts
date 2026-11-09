import { describe, expect, it } from 'vitest'
import { effectiveFactor, formatPortions, isValidPortionFactor, portionsNeeded, withFactor } from './portions'

const anna = { id: 1, portionFactor: 1 }
const marco = { id: 2, portionFactor: 1 }
const sam = { id: 3, portionFactor: 0.5 }
const members = [anna, marco, sam]

describe('portionsNeeded', () => {
  it('sums the default Portion Factors of the attending Members', () => {
    const all = [1, 2, 3].map((memberId) => ({ memberId, portionFactorOverride: null }))
    expect(portionsNeeded(members, all)).toBe(2.5)
  })

  it('is 0 when nobody attends', () => {
    expect(portionsNeeded(members, [])).toBe(0)
  })

  it('uses an override instead of the default', () => {
    expect(portionsNeeded(members, [{ memberId: 3, portionFactorOverride: 1.5 }, { memberId: 1, portionFactorOverride: null }])).toBe(2.5)
  })

  it('ignores entries for unknown Members', () => {
    expect(portionsNeeded(members, [{ memberId: 99, portionFactorOverride: null }, { memberId: 1, portionFactorOverride: null }])).toBe(1)
  })
})

describe('effectiveFactor and withFactor', () => {
  it('effectiveFactor prefers the override', () => {
    expect(effectiveFactor(sam, { memberId: 3, portionFactorOverride: null })).toBe(0.5)
    expect(effectiveFactor(sam, { memberId: 3, portionFactorOverride: 2 })).toBe(2)
  })

  it('withFactor stores an override, or null when it equals the default', () => {
    const entry = { memberId: 3, portionFactorOverride: null }
    expect(withFactor(sam, entry, 0.75)).toEqual({ memberId: 3, portionFactorOverride: 0.75 })
    expect(withFactor(sam, { memberId: 3, portionFactorOverride: 0.75 }, 0.5)).toEqual({ memberId: 3, portionFactorOverride: null })
  })
})

describe('isValidPortionFactor', () => {
  it.each([0.25, 0.5, 1, 1.75, 3])('accepts %s', (n) => expect(isValidPortionFactor(n)).toBe(true))
  it.each([0, -1, 0.2, 0.3, 3.25, 4, Number.NaN])('rejects %s', (n) => expect(isValidPortionFactor(n)).toBe(false))
})

describe('formatPortions', () => {
  it.each([
    [1, '1 portion'],
    [2, '2 portions'],
    [2.5, '2.5 portions'],
    [0.25, '0.25 portions'],
    [0, '0 portions'],
  ])('%s -> %s', (n, text) => expect(formatPortions(n)).toBe(text))
})

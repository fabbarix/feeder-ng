import { describe, expect, it } from 'vitest'
import { YIELD_UNITS, yieldFromLine } from './yield'

describe('YIELD_UNITS', () => {
  it('has the weights, the volumes, piece and portion', () => {
    expect(YIELD_UNITS).toEqual(expect.arrayContaining(['g', 'kg', 'ml', 'l', 'piece', 'portion']))
  })
  it('has cup too (design §3.1)', () => {
    expect(YIELD_UNITS).toContain('cup')
  })
})

describe('yieldFromLine (a new Base recipe from a line)', () => {
  it('takes the line amount and unit', () => {
    expect(yieldFromLine(500, 'ml')).toEqual({ yield: 500, yieldUnit: 'ml' })
    expect(yieldFromLine(2, 'kg')).toEqual({ yield: 2, yieldUnit: 'kg' })
  })
  it('keeps a cup (a Yield unit), and falls back to 1 portion for a unit a Yield cannot have', () => {
    expect(yieldFromLine(2, 'cup')).toEqual({ yield: 2, yieldUnit: 'cup' })
    expect(yieldFromLine(3, 'clove')).toEqual({ yield: 1, yieldUnit: 'portion' })
  })
  it('falls back to 1 of the unit for a quantity that is not positive', () => {
    expect(yieldFromLine(0, 'ml')).toEqual({ yield: 1, yieldUnit: 'ml' })
    expect(yieldFromLine(Number.NaN, 'g')).toEqual({ yield: 1, yieldUnit: 'g' })
  })
})

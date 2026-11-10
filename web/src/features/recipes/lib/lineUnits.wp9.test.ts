import { describe, expect, it } from 'vitest'
import { flour, garlic, milk } from '../fixtures.test-helper'
import { needsConversion, selectableUnits, unitChoicesOf } from './lineUnits'

describe('unitChoicesOf', () => {
  it('splits the units into Base Unit, Unit Conversions and the other global units', () => {
    expect(unitChoicesOf(garlic)).toEqual({ baseUnit: 'g', conversions: [{ unit: 'clove', toBase: 5 }], globalUnits: ['kg'] })
    expect(unitChoicesOf(milk).globalUnits).toEqual(['l', 'dl', 'cl', 'tsp', 'tbsp', 'cup'])
  })
  it('covers exactly the selectable units, without repeating the Base Unit', () => {
    for (const ing of [garlic, flour, milk]) {
      const c = unitChoicesOf(ing)
      expect([c.baseUnit, ...c.conversions.map((x) => x.unit), ...c.globalUnits].sort()).toEqual([...selectableUnits(ing)].sort())
    }
  })
})

describe('needsConversion', () => {
  it('is true for a unit the Ingredient does not know', () => {
    expect(needsConversion('handful', garlic)).toBe(true)
  })
  it('is false for known units, in any case or padding', () => {
    expect(needsConversion('clove', garlic)).toBe(false)
    expect(needsConversion(' KG ', flour)).toBe(false)
  })
  it('is false for a blank unit and while the Ingredient is not loaded', () => {
    expect(needsConversion('', garlic)).toBe(false)
    expect(needsConversion('handful', undefined)).toBe(false)
  })
})

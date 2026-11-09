import { describe, expect, it } from 'vitest'
import type { IngredientRef } from '../types'
import { isKnownUnit, selectableUnits } from './lineUnits'

const garlic: IngredientRef = { id: 1, name: 'garlic', baseUnit: 'g', conversions: [{ unit: 'clove', toBase: 5 }] }
const milk: IngredientRef = { id: 2, name: 'milk', baseUnit: 'ml', conversions: [] }
const egg: IngredientRef = { id: 3, name: 'egg', baseUnit: 'piece', conversions: [] }
const flour: IngredientRef = { id: 4, name: 'flour', baseUnit: 'g', conversions: [{ unit: 'cup', toBase: 120 }] }

describe('selectableUnits', () => {
  it('lists the Base Unit first, then global units, then the Ingredient conversions', () => {
    expect(selectableUnits(garlic)).toEqual(['g', 'kg', 'clove'])
    expect(selectableUnits(milk)).toEqual(['ml', 'l', 'dl', 'cl', 'tsp', 'tbsp', 'cup'])
    expect(selectableUnits(egg)).toEqual(['piece'])
  })

  it('lists a conversion that overrides a global unit once', () => {
    expect(selectableUnits(flour)).toEqual(['g', 'kg', 'cup'])
  })
})

describe('isKnownUnit', () => {
  it('accepts listed units ignoring case and spaces', () => {
    expect(isKnownUnit(' Clove ', garlic)).toBe(true)
    expect(isKnownUnit('KG', garlic)).toBe(true)
    expect(isKnownUnit('tbsp', milk)).toBe(true)
  })

  it('rejects everything else: spoon measures for a weighed Ingredient, kg for pieces, oz', () => {
    expect(isKnownUnit('tbsp', garlic)).toBe(false)
    expect(isKnownUnit('kg', egg)).toBe(false)
    expect(isKnownUnit('oz', flour)).toBe(false)
    expect(isKnownUnit('', milk)).toBe(false)
  })
})

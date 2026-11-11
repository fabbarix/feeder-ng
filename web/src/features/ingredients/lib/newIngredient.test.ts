import { describe, expect, it } from 'vitest'
import { icons } from '../../../ui/icons'
import { strings } from '../strings'
import type { Ingredient } from '../types'
import { baseUnitIcon, checkNewIngredient, defaultBaseUnit, duplicateGuard } from './newIngredient'

const garlic: Ingredient = { id: 7, name: 'Garlic', baseUnit: 'g', shelfLifeDays: null, conversions: [] }
const garlicClove: Ingredient = { id: 8, name: 'Garlic cloves', baseUnit: 'g', shelfLifeDays: null, conversions: [] }

describe('defaultBaseUnit (the preselected Base Unit)', () => {
  it.each([
    [undefined, 'g'],
    [null, 'g'],
    ['', 'g'],
    ['g', 'g'],
    ['kg', 'g'],
    ['oz', 'g'],
    ['lb', 'g'],
    ['ml', 'ml'],
    ['l', 'ml'],
    ['dl', 'ml'],
    ['cl', 'ml'],
    ['tsp', 'ml'],
    ['tbsp', 'ml'],
    ['cup', 'ml'],
    ['fl oz', 'ml'],
    ['piece', 'piece'],
    ['  TBSP ', 'ml'],
    ['clove', 'g'],
    ['handful', 'g'],
  ] as const)('%s -> %s', (unit, base) => {
    expect(defaultBaseUnit(unit)).toBe(base)
  })
})

describe('baseUnitIcon', () => {
  it('gives each Base Unit its own glyph, all of them in the icon registry', () => {
    expect([baseUnitIcon('g'), baseUnitIcon('ml'), baseUnitIcon('piece')]).toEqual(['weigh', 'liquid', 'piece'])
    for (const unit of ['g', 'ml', 'piece'] as const) expect(Object.keys(icons)).toContain(baseUnitIcon(unit))
  })
})

describe('checkNewIngredient', () => {
  it('trims the name and leaves Shelf Life out when blank', () => {
    expect(checkNewIngredient({ name: '  Olive   oil ', baseUnit: 'ml', shelfLife: '' })).toEqual({ ok: true, value: { name: 'Olive oil', baseUnit: 'ml' } })
  })
  it('sends a whole Shelf Life in days', () => {
    expect(checkNewIngredient({ name: 'Milk', baseUnit: 'ml', shelfLife: ' 7 ' })).toEqual({ ok: true, value: { name: 'Milk', baseUnit: 'ml', shelfLifeDays: 7 } })
  })
  it('asks for a name instead of staying silent', () => {
    expect(checkNewIngredient({ name: '   ', baseUnit: 'g', shelfLife: '' })).toEqual({ ok: false, errors: { name: strings.sheet.nameRequired } })
  })
  it.each(['0', '-3', '1.5', 'soon', '3651'])('refuses the Shelf Life %j', (shelfLife) => {
    expect(checkNewIngredient({ name: 'Milk', baseUnit: 'ml', shelfLife })).toEqual({ ok: false, errors: { shelfLife: strings.sheet.shelfLifeInvalid } })
  })
  it('accepts the server maximum of 3650 days', () => {
    expect(checkNewIngredient({ name: 'Rice', baseUnit: 'g', shelfLife: '3650' })).toEqual({ ok: true, value: { name: 'Rice', baseUnit: 'g', shelfLifeDays: 3650 } })
  })
  it('reports every problem at once', () => {
    expect(checkNewIngredient({ name: '', baseUnit: 'g', shelfLife: '0' })).toEqual({
      ok: false,
      errors: { name: strings.sheet.nameRequired, shelfLife: strings.sheet.shelfLifeInvalid },
    })
  })
})

describe('duplicateGuard (same matcher as Import Review)', () => {
  it('lets a name with no match through', () => {
    expect(duplicateGuard({ exact: null, suggestions: [] })).toEqual({ kind: 'clear' })
  })
  it('stops on an exact match', () => {
    expect(duplicateGuard({ exact: garlic, suggestions: [] })).toEqual({ kind: 'exists', ingredient: garlic })
  })
  it('offers the close names, best first, as sent by the server', () => {
    const suggestions = [{ ingredient: garlic, score: 0.9 }, { ingredient: garlicClove, score: 0.7 }]
    expect(duplicateGuard({ exact: null, suggestions })).toEqual({ kind: 'similar', suggestions })
  })
})

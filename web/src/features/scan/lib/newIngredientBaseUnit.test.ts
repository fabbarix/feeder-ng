// R2-4: a new Ingredient created in the "what is this?" sheet takes its Base Unit from the pack unit with the SAME rule as the
// New Ingredient sheet (ingredients/lib/newIngredient.defaultBaseUnit), not a second copy.
import { describe, expect, it } from 'vitest'
import { defaultBaseUnit } from '../../ingredients/lib/newIngredient'
import { newIngredientBaseUnit } from './unknownForm'

describe('newIngredientBaseUnit', () => {
  it.each([
    ['g', 'g'],
    ['kg', 'g'],
    ['oz', 'g'],
    ['lb', 'g'],
    ['ml', 'ml'],
    ['l', 'ml'],
    ['piece', 'piece'],
    ['', 'g'],
  ])('%s -> %s', (unit, base) => {
    expect(newIngredientBaseUnit(unit)).toBe(base)
  })
  it('agrees with defaultBaseUnit for every unit the sheet or a Recipe line can carry', () => {
    for (const u of ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'dl', 'cl', 'tsp', 'tbsp', 'cup', 'fl oz', 'piece', 'clove', ' ML ', '']) {
      expect(newIngredientBaseUnit(u)).toBe(defaultBaseUnit(u))
    }
  })
})

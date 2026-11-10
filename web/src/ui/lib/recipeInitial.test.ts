import { describe, expect, it } from 'vitest'
import { recipeInitial } from './recipeInitial'

describe('recipeInitial', () => {
  it('is the upper-cased first letter', () => {
    expect(recipeInitial('chickpea & coconut curry')).toBe('C')
    expect(recipeInitial('  lasagne')).toBe('L')
    expect(recipeInitial('élan')).toBe('É')
  })
  it('takes a whole code point', () => {
    expect(recipeInitial('🍝 pasta')).toBe('🍝')
  })
  it('is "?" for a blank name', () => {
    expect(recipeInitial('')).toBe('?')
    expect(recipeInitial('   ')).toBe('?')
  })
})

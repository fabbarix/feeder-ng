import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { displayName, filterIngredients, ingredientMeta, normalizeName } from './names'

const ing = (id: number, name: string): Ingredient => ({ id, name, baseUnit: 'g', shelfLifeDays: null, conversions: [] })

describe('normalizeName', () => {
  it.each([
    ['onion', 'onion'],
    ['  Red   ONION ', 'red onion'],
    ['olive\toil', 'olive oil'],
    ['', ''],
  ])('%j -> %j', (input, key) => expect(normalizeName(input)).toBe(key))
})

describe('filterIngredients', () => {
  const list = [ing(1, 'Zucchini'), ing(2, 'red onion'), ing(3, 'Onion'), ing(4, 'apple')]
  it('returns everything, ordered by normalised name, for a blank query', () => {
    expect(filterIngredients(list, '  ').map((i) => i.id)).toEqual([4, 3, 2, 1])
  })
  it('matches by normalised substring', () => {
    expect(filterIngredients(list, ' ONION ').map((i) => i.name)).toEqual(['Onion', 'red onion'])
    expect(filterIngredients(list, 'red  on').map((i) => i.name)).toEqual(['red onion'])
  })
  it('returns nothing when nothing matches and does not mutate the input', () => {
    const copy = [...list]
    expect(filterIngredients(list, 'xyz')).toEqual([])
    expect(list).toEqual(copy)
  })
})

describe('displayName (sentence case in the UI)', () => {
  it('capitalises the first letter only', () => {
    expect(displayName('garlic')).toBe('Garlic')
    expect(displayName('olive oil')).toBe('Olive oil')
    expect(displayName('Parmigiano Reggiano')).toBe('Parmigiano Reggiano')
  })
  it('handles accents, blanks and a leading space', () => {
    expect(displayName('èpices')).toBe('Èpices')
    expect(displayName('')).toBe('')
    expect(displayName('  egg')).toBe('Egg')
  })
})

describe('ingredientMeta', () => {
  it('joins the Base Unit and the Shelf Life with a middle dot', () => {
    expect(ingredientMeta('g', 30)).toBe('g · keeps 30 days')
    expect(ingredientMeta('g', 1)).toBe('g · keeps 1 day')
  })
  it('is the Base Unit alone without a Shelf Life', () => {
    expect(ingredientMeta('fl oz', null)).toBe('fl oz')
  })
})

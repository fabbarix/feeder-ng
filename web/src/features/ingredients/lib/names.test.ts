import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { filterIngredients, normalizeName } from './names'

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

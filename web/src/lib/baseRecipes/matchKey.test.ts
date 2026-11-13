import { describe, expect, it } from 'vitest'
import { displayBaseName, referenceKey } from './matchKey'

describe('referenceKey (units.NormalizeName: case, accents, spacing, one trailing s)', () => {
  it.each([
    ['béchamel', 'bechamel'],
    ['  Béchamel ', 'bechamel'],
    ['BÉCHAMEL', 'bechamel'],
    ['Béchamels', 'bechamel'],
    ['white   sauce', 'white sauce'],
    ['Crème  fraîche', 'creme fraiche'],
  ])('%j -> %j', (name, key) => expect(referenceKey(name)).toBe(key))
  it('makes the same key for names the link treats as one Ingredient', () => {
    expect(referenceKey('Béchamel')).toBe(referenceKey('bechamels'))
  })
})

describe('displayBaseName', () => {
  it('trims, collapses spaces and capitalises the first letter, keeping the rest', () => {
    expect(displayBaseName('  béchamel  ')).toBe('Béchamel')
    expect(displayBaseName('pasta   frolla')).toBe('Pasta frolla')
    expect(displayBaseName('ragù Bolognese')).toBe('Ragù Bolognese')
  })
  it('returns an empty string for blank input', () => expect(displayBaseName('   ')).toBe(''))
})

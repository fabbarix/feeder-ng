import { describe, expect, it } from 'vitest'
import { defaultProductName, formatPackSize } from './names'

describe('formatPackSize', () => {
  it.each([
    [700, 'g', '700 g'],
    [1000, 'g', '1000 g'],
    [500, 'ml', '500 ml'],
    [1, 'piece', '1 piece'],
    [6, 'piece', '6 pieces'],
    [0.5, 'piece', '0.5 pieces'],
    [12.5, 'g', '12.5 g'],
    [12.345, 'g', '12.35 g'],
    [250.0, 'ml', '250 ml'],
  ] as const)('%s %s -> %s', (size, base, want) => {
    expect(formatPackSize(size, base)).toBe(want)
  })
})

describe('formatPackSize imperial (B9: pack sizes use the shared formatter)', () => {
  it.each([
    [700, 'g', '1 lb 9 oz'],
    [250, 'g', '8.8 oz'],
    [500, 'ml', '2 cups'],
    [1000, 'ml', '4.25 cups'],
    [6, 'piece', '6 pieces'],
    [1, 'piece', '1 piece'],
  ] as const)('%s %s -> %s', (size, base, want) => {
    expect(formatPackSize(size, base, 'imperial')).toBe(want)
  })
  it('metric stays as stored', () => {
    expect(formatPackSize(700, 'g', 'metric')).toBe('700 g')
  })
  it('default Product names stay metric whatever the display system', () => {
    expect(defaultProductName('tomato passata', 700, 'g')).toBe('Tomato passata 700 g')
  })
})

describe('defaultProductName', () => {
  it('is the Ingredient and the pack size', () => {
    expect(defaultProductName('tomato passata', 700, 'g')).toBe('Tomato passata 700 g')
    expect(defaultProductName('Milk', 1000, 'ml')).toBe('Milk 1000 ml')
    expect(defaultProductName('eggs', 6, 'piece')).toBe('Eggs 6 pieces')
  })
  it('keeps the rest of the name as typed', () => {
    expect(defaultProductName('extra virgin olive oil', 750, 'ml')).toBe('Extra virgin olive oil 750 ml')
  })
})

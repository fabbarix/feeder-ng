import { describe, expect, it } from 'vitest'
import { baseUnitLabel, formatConversion, formatQuantity } from './units'

describe('formatQuantity metric', () => {
  it.each([
    [250, 'g', '250 g'],
    [1400, 'g', '1400 g'],
    [0, 'g', '0 g'],
    [0.5, 'g', '0.5 g'],
    [12.345, 'g', '12.3 g'],
    [12.0, 'g', '12 g'],
    [250, 'ml', '250 ml'],
    [1500, 'ml', '1500 ml'],
    [1, 'piece', '1 piece'],
    [3, 'piece', '3 pieces'],
    [0, 'piece', '0 pieces'],
    [0.5, 'piece', '0.5 pieces'],
    [-5, 'g', '-5 g'],
  ] as const)('%s %s -> %s', (amount, base, text) => {
    expect(formatQuantity(amount, base, 'metric')).toBe(text)
  })
  it('returns an empty string for non-finite input', () => {
    expect(formatQuantity(NaN, 'g', 'metric')).toBe('')
    expect(formatQuantity(Infinity, 'ml', 'imperial')).toBe('')
  })
})

describe('formatQuantity imperial mass', () => {
  it.each([
    [0, '0 oz'],
    [28.3495, '1 oz'],
    [100, '3.5 oz'],
    [250, '8.8 oz'],
    [453, '1 lb'], // 15.98 oz rounds to a whole pound
    [453.59237, '1 lb'],
    [500, '1 lb 2 oz'],
    [1000, '2 lb 3 oz'],
    [1400, '3 lb 1 oz'],
    [-100, '-3.5 oz'],
  ] as const)('%s g -> %s', (grams, text) => {
    expect(formatQuantity(grams, 'g', 'imperial')).toBe(text)
  })
})

describe('formatQuantity imperial volume', () => {
  it.each([
    [0, '0 fl oz'],
    [0.3, '0.25 tsp'], // positive never shows as 0
    [2.5, '0.5 tsp'],
    [5, '1 tsp'],
    [7.4, '1.5 tsp'],
    [13.9, '2.75 tsp'],
    [15, '1 tbsp'],
    [22, '1.5 tbsp'],
    [30, '2 tbsp'],
    [59, '4 tbsp'],
    [60, '2 fl oz'],
    [100, '3.4 fl oz'],
    [120, '0.5 cups'],
    [240, '1 cup'],
    [250, '1 cup'],
    [500, '2 cups'],
    [1000, '4.25 cups'],
  ] as const)('%s ml -> %s', (ml, text) => {
    expect(formatQuantity(ml, 'ml', 'imperial')).toBe(text)
  })
})

describe('formatQuantity imperial pieces', () => {
  it('is the same as metric', () => {
    expect(formatQuantity(3, 'piece', 'imperial')).toBe('3 pieces')
    expect(formatQuantity(1, 'piece', 'imperial')).toBe('1 piece')
  })
})

describe('baseUnitLabel', () => {
  it.each([
    ['g', 'metric', 'g'],
    ['ml', 'metric', 'ml'],
    ['piece', 'metric', 'piece'],
    ['g', 'imperial', 'oz'],
    ['ml', 'imperial', 'fl oz'],
    ['piece', 'imperial', 'piece'],
  ] as const)('%s in %s -> %s', (base, system, label) => {
    expect(baseUnitLabel(base, system)).toBe(label)
  })
})

describe('formatConversion', () => {
  it('shows metric as stored', () => {
    expect(formatConversion('clove', 5, 'g', 'metric')).toBe('1 clove = 5 g')
    expect(formatConversion('cup', 240, 'ml', 'metric')).toBe('1 cup = 240 ml')
    expect(formatConversion('bunch', 2, 'piece', 'metric')).toBe('1 bunch = 2 pieces')
  })
  it('shows imperial in oz and fl oz', () => {
    expect(formatConversion('clove', 5, 'g', 'imperial')).toBe('1 clove = 0.2 oz')
    expect(formatConversion('splash', 30, 'ml', 'imperial')).toBe('1 splash = 2 tbsp')
  })
})

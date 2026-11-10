import { describe, expect, it } from 'vitest'
import { baseUnitLabel, formatConversion, formatLineQuantity, formatQuantity } from './units'

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
    expect(formatConversion('splash', 30, 'ml', 'imperial')).toBe('1 splash = 1 fl oz')
  })
})

describe('formatConversion imperial shows the base side as oz or fl oz, never as a recipe unit (B9)', () => {
  it.each([
    ['cup', 240, 'ml', '1 cup = 8.1 fl oz'], // was "1 cup = 1 cup"
    ['splash', 30, 'ml', '1 splash = 1 fl oz'],
    ['jar', 700, 'ml', '1 jar = 23.7 fl oz'],
    ['pinch', 1, 'ml', '1 pinch = 0.03 fl oz'], // positive never reads 0
    ['clove', 5, 'g', '1 clove = 0.2 oz'],
    ['tub', 500, 'g', '1 tub = 17.6 oz'], // no lb switch inside a conversion label
    ['bunch', 2, 'piece', '1 bunch = 2 pieces'],
  ] as const)('%s %s %s -> %s', (unit, toBase, base, text) => {
    expect(formatConversion(unit, toBase, base, 'imperial')).toBe(text)
  })
  it('metric is unchanged', () => {
    expect(formatConversion('cup', 240, 'ml', 'metric')).toBe('1 cup = 240 ml')
  })
})

describe('formatLineQuantity (B9: "2 tbsp" must not become "0.4 oz")', () => {
  it.each([
    [2, 'tbsp', '2 tbsp'],
    [1.5, 'tsp', '1.5 tsp'],
    [0.5, 'cup', '0.5 cup'],
    [3, 'clove', '3 clove'],
    [1, 'piece', '1 piece'],
    [2.333, 'tbsp', '2.33 tbsp'],
    [2, ' TBSP ', '2 tbsp'],
  ] as const)('%s %s is shown as written in imperial: %s', (q, unit, text) => {
    expect(formatLineQuantity(q, unit, 'imperial')).toBe(text)
  })
  it.each([
    [250, 'g', '8.8 oz'],
    [1, 'kg', '2 lb 3 oz'],
    [250, 'ml', '1 cup'],
    [1, 'l', '4.25 cups'],
    [2, 'dl', '0.75 cups'],
    [3, 'cl', '2 tbsp'],
  ] as const)('%s %s metric mass or volume converts in imperial: %s', (q, unit, text) => {
    expect(formatLineQuantity(q, unit, 'imperial')).toBe(text)
  })
  it('metric shows everything as written, g and ml through formatQuantity', () => {
    expect(formatLineQuantity(2, 'tbsp', 'metric')).toBe('2 tbsp')
    expect(formatLineQuantity(250, 'g', 'metric')).toBe('250 g')
    expect(formatLineQuantity(1.5, 'kg', 'metric')).toBe('1.5 kg')
    expect(formatLineQuantity(3, 'clove', 'metric')).toBe('3 clove')
  })
  it('returns an empty string for non-finite input', () => {
    expect(formatLineQuantity(NaN, 'g', 'imperial')).toBe('')
  })
})

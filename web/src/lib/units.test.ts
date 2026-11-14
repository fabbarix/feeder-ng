import { describe, expect, it } from 'vitest'
import { baseUnitLabel, formatConversion, formatLineQuantity, formatQuantity } from './units'

describe('formatQuantity metric', () => {
  it.each([
    [250, 'g', '250 g'],
    [1400, 'g', '1.4 kg'],
    [0, 'g', '0 g'],
    [0.5, 'g', '0.5 g'],
    [12.345, 'g', '12.3 g'],
    [12.0, 'g', '12 g'],
    [250, 'ml', '250 ml'],
    [1500, 'ml', '1.5 l'],
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

// R10: "2 piece" -> "2 pieces". Only the piece Base Unit has a plural; g, ml, oz, fl oz never do.
describe('baseUnitLabel with a count', () => {
  it.each([
    [1, 'piece'],
    [2, 'pieces'],
    [0, 'pieces'],
    [0.5, 'pieces'],
    [12, 'pieces'],
  ])('piece x %s reads %s', (count, label) => {
    expect(baseUnitLabel('piece', 'metric', count)).toBe(label)
    expect(baseUnitLabel('piece', 'imperial', count)).toBe(label)
  })

  it('leaves g, ml, oz and fl oz alone, and the label without a count as it was', () => {
    expect(baseUnitLabel('g', 'metric', 2)).toBe('g')
    expect(baseUnitLabel('ml', 'imperial', 2)).toBe('fl oz')
    expect(baseUnitLabel('piece', 'metric')).toBe('piece')
  })
})

// B9-22 / SSP-16 (decision SSP 7-A): metric display promotes to kg and l from 1000 g / 1000 ml. The Base Unit stays the
// stored and entered unit; only the text changes. Numbers are grouped with "," and use "." for decimals (no locale input).
describe('SSP-16 big quantities: formatQuantity metric promotes to kg and l', () => {
  it.each([
    [999, 'g', '999 g'],
    [999.9, 'g', '999.9 g'],
    [999.94, 'g', '999.9 g'], // rounds to 1 decimal below 1000: still grams
    [999.96, 'g', '1 kg'], // would round to "1000 g": promoted instead, never "1000 g"
    [1000, 'g', '1 kg'],
    [1001, 'g', '1 kg'], // at most 2 decimals
    [1006, 'g', '1.01 kg'],
    [1250, 'g', '1.25 kg'],
    [1500, 'g', '1.5 kg'],
    [12000, 'g', '12 kg'],
    [12500, 'g', '12.5 kg'],
    [100000, 'g', '100 kg'],
    [1250000, 'g', '1,250 kg'], // digits grouped
    [999, 'ml', '999 ml'],
    [999.96, 'ml', '1 l'],
    [1000, 'ml', '1 l'],
    [1250, 'ml', '1.25 l'],
    [1500, 'ml', '1.5 l'],
    [12000, 'ml', '12 l'],
    [1250000, 'ml', '1,250 l'],
  ] as const)('%s %s -> %s', (amount, base, text) => {
    expect(formatQuantity(amount, base, 'metric')).toBe(text)
  })

  it('below 1000 nothing changes: still g and ml, 1 decimal, trailing .0 dropped', () => {
    expect(formatQuantity(250, 'g', 'metric')).toBe('250 g')
    expect(formatQuantity(12.345, 'g', 'metric')).toBe('12.3 g')
    expect(formatQuantity(0, 'g', 'metric')).toBe('0 g')
    expect(formatQuantity(0, 'ml', 'metric')).toBe('0 ml')
  })

  it('a negative amount is the positive amount with a leading "-", promoted by its absolute value', () => {
    expect(formatQuantity(-999, 'g', 'metric')).toBe('-999 g')
    expect(formatQuantity(-1000, 'g', 'metric')).toBe('-1 kg')
    expect(formatQuantity(-1500, 'ml', 'metric')).toBe('-1.5 l')
  })

  it('uses a plain space and a "." decimal, with no trailing zeros', () => {
    expect(formatQuantity(1200, 'g', 'metric')).toBe('1.2 kg')
    expect(formatQuantity(2000, 'ml', 'metric')).toBe('2 l')
    expect(formatQuantity(1500, 'g', 'metric')).not.toMatch(/\.0|\u00a0|\u202f/)
  })

  it('pieces are only grouped (no larger unit), 1 decimal at most', () => {
    expect(formatQuantity(999, 'piece', 'metric')).toBe('999 pieces')
    expect(formatQuantity(1000, 'piece', 'metric')).toBe('1,000 pieces')
    expect(formatQuantity(1250, 'piece', 'metric')).toBe('1,250 pieces')
    expect(formatQuantity(504, 'piece', 'metric')).toBe('504 pieces')
    expect(formatQuantity(1250.5, 'piece', 'metric')).toBe('1,250.5 pieces')
    expect(formatQuantity(1000000, 'piece', 'metric')).toBe('1,000,000 pieces')
    expect(formatQuantity(-1250, 'piece', 'metric')).toBe('-1,250 pieces')
    expect(formatQuantity(1250, 'piece', 'imperial')).toBe('1,250 pieces')
  })

  it('imperial is unchanged: no kg or l, the lb and cup rules stand', () => {
    expect(formatQuantity(1000, 'g', 'imperial')).toBe('2 lb 3 oz')
    expect(formatQuantity(12000, 'g', 'imperial')).toBe('26 lb 7 oz')
    expect(formatQuantity(1500, 'ml', 'imperial')).toBe('6.25 cups')
  })

  it('formatting never changes the stored amount: the Base Unit number is read, not rewritten', () => {
    const stored = { quantity: 12000, base: 'g' as const }
    expect(formatQuantity(stored.quantity, stored.base, 'metric')).toBe('12 kg')
    expect(stored).toEqual({ quantity: 12000, base: 'g' })
  })
})

describe('SSP-16 baseUnitLabel stays the Base Unit (inputs and NumberField suffixes stay g, ml)', () => {
  it('has no kg or l label', () => {
    expect(baseUnitLabel('g', 'metric')).toBe('g')
    expect(baseUnitLabel('ml', 'metric')).toBe('ml')
  })
})

describe('SSP-16 formatConversion in metric promotes the base side too', () => {
  it.each([
    ['sack', 1500, 'g', '1 sack = 1.5 kg'],
    ['bottle', 1000, 'ml', '1 bottle = 1 l'],
    ['box', 1250, 'piece', '1 box = 1,250 pieces'],
    ['clove', 5, 'g', '1 clove = 5 g'],
  ] as const)('%s %s %s -> %s', (unit, toBase, base, text) => {
    expect(formatConversion(unit, toBase, base, 'metric')).toBe(text)
  })
  it('imperial stays oz and fl oz', () => {
    expect(formatConversion('sack', 1500, 'g', 'imperial')).toBe('1 sack = 52.9 oz')
  })
})

describe('SSP-16 formatLineQuantity: g and ml lines read through formatQuantity, other units as written', () => {
  it.each([
    [1500, 'g', 'metric', '1.5 kg'],
    [1000, 'ml', 'metric', '1 l'],
    [1200, 'ml', 'metric', '1.2 l'],
    [999, 'g', 'metric', '999 g'],
    [1.5, 'kg', 'metric', '1.5 kg'], // as written
    [2, 'l', 'metric', '2 l'],
    [5, 'dl', 'metric', '5 dl'],
    [1500, 'tbsp', 'metric', '1500 tbsp'], // not a mass or volume unit of ours: as written, ungrouped
    [1500, 'g', 'imperial', '3 lb 5 oz'],
  ] as const)('%s %s (%s) -> %s', (q, unit, system, text) => {
    expect(formatLineQuantity(q, unit, system)).toBe(text)
  })
})

import { describe, expect, it } from 'vitest'
import { amountOf, amountOfText } from './amountOf'

// b8-polish (docs/dev/design/b8-polish.md 2): the compact "x/y" form for a narrow row. The Scanned rows can use it later.
// amountOf keeps returning the two amounts as before (its optional 5th argument does not change them); amountOfText joins them.
describe('amountOfText: "x of y", or the compact "x/y"', () => {
  it('the full form is "x of y" (what the Shop copy always said)', () => {
    expect(amountOfText(400, 1000, 'ml', 'metric')).toBe('400 of 1000 ml')
    expect(amountOfText(2, 6, 'piece', 'metric')).toBe('2 of 6')
    expect(amountOfText(200, 500, 'g', 'imperial')).toBe('7.1 oz of 1 lb 2 oz')
  })
  it('compact joins with a slash and no spaces around it; the unit stays once, on y', () => {
    expect(amountOfText(400, 1000, 'ml', 'metric', { compact: true })).toBe('400/1000 ml')
    expect(amountOfText(250, 375, 'g', 'metric', { compact: true })).toBe('250/375 g')
    expect(amountOfText(2, 6, 'piece', 'metric', { compact: true })).toBe('2/6')
  })
  it('compact keeps both units when they differ or the system is imperial', () => {
    expect(amountOfText(800, 1200, 'g', 'metric', { compact: true })).toBe('800/1200 g')
    expect(amountOfText(200, 500, 'g', 'imperial', { compact: true })).toBe('7.1 oz/1 lb 2 oz')
  })
  it('compact: float dust and a negative x read 0, as in the full form', () => {
    expect(amountOfText(1e-12, 6, 'piece', 'metric', { compact: true })).toBe('0/6')
    expect(amountOfText(-0.5, 500, 'ml', 'metric', { compact: true })).toBe('0/500 ml')
  })
  it('compact: false is the full form', () => {
    expect(amountOfText(400, 1000, 'ml', 'metric', { compact: false })).toBe('400 of 1000 ml')
  })
})

describe('amountOf is unchanged', () => {
  it('still returns the two texts', () => {
    expect(amountOf(400, 1000, 'ml', 'metric')).toEqual(['400', '1000 ml'])
  })
})

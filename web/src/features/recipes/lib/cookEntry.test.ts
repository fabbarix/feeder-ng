import { describe, expect, it } from 'vitest'
import { batchAmount, batchAmountText, batchPortions, MAX_BATCHES, MIN_BATCHES } from './cookEntry'

describe('batchPortions', () => {
  it('multiplies Yield by Batches', () => {
    expect(batchPortions(4, 2)).toBe('8')
    expect(batchPortions(2.5, 3)).toBe('7.5')
  })
  it('hides floating point noise', () => {
    expect(batchPortions(0.1, 3)).toBe('0.3')
  })
})

describe('Batch bounds', () => {
  it('are 1 to 10', () => {
    expect([MIN_BATCHES, MAX_BATCHES]).toEqual([1, 10])
  })
})

// RX-06: the Cook hint states the Yield with its unit: "1 Batch · 800 g", "2 Batches · 1.6 kg". batchAmount scales the Yield and returns it in
// the base of its unit (g, ml, piece, or 'portion'), so the same formatter as the Ingredient lines can word it in the User's display units.
describe('batchAmount', () => {
  it('a plannable Recipe (no unit) and the unit portion make portions', () => {
    expect(batchAmount(4, null, 2)).toEqual({ quantity: 8, unit: 'portion' })
    expect(batchAmount(4, undefined, 1)).toEqual({ quantity: 4, unit: 'portion' })
    expect(batchAmount(6, 'portion', 3)).toEqual({ quantity: 18, unit: 'portion' })
  })
  it('weights are in grams: g stays, kg rolls down to g', () => {
    expect(batchAmount(800, 'g', 2)).toEqual({ quantity: 1600, unit: 'g' })
    expect(batchAmount(1.5, 'kg', 2)).toEqual({ quantity: 3000, unit: 'g' })
  })
  it('volumes are in millilitres: ml, l, dl, cl, tsp, tbsp and cup', () => {
    expect(batchAmount(300, 'ml', 1)).toEqual({ quantity: 300, unit: 'ml' })
    expect(batchAmount(1, 'l', 3)).toEqual({ quantity: 3000, unit: 'ml' })
    expect(batchAmount(2, 'dl', 1)).toEqual({ quantity: 200, unit: 'ml' })
    expect(batchAmount(5, 'cl', 2)).toEqual({ quantity: 100, unit: 'ml' })
    expect(batchAmount(2, 'tsp', 1)).toEqual({ quantity: 10, unit: 'ml' })
    expect(batchAmount(2, 'tbsp', 1)).toEqual({ quantity: 30, unit: 'ml' })
    expect(batchAmount(2, 'cup', 2)).toEqual({ quantity: 960, unit: 'ml' })
  })
  it('a count of pieces stays a count of pieces', () => {
    expect(batchAmount(12, 'piece', 2)).toEqual({ quantity: 24, unit: 'piece' })
  })
  it('hides floating point noise', () => {
    expect(batchAmount(0.1, 'kg', 3)).toEqual({ quantity: 300, unit: 'g' })
    expect(batchAmount(0.1, null, 3)).toEqual({ quantity: 0.3, unit: 'portion' })
  })
})

describe('batchAmountText', () => {
  it('words a weight in the User\'s display units, rolling 1,600 g up to "1.6 kg"', () => {
    expect(batchAmountText(800, 'g', 1, 'metric')).toBe('800 g')
    expect(batchAmountText(800, 'g', 2, 'metric')).toBe('1.6 kg')
    expect(batchAmountText(1.5, 'kg', 2, 'metric')).toBe('3 kg')
  })
  it('words a weight in imperial when the User reads imperial', () => {
    expect(batchAmountText(800, 'g', 2, 'imperial')).toBe('3 lb 8 oz')
  })
  it('words a volume and a count of pieces', () => {
    expect(batchAmountText(1, 'l', 2, 'metric')).toBe('2 l')
    expect(batchAmountText(12, 'piece', 2, 'metric')).toBe('24 pieces')
  })
  it('words portions as portions, never "pieces"', () => {
    expect(batchAmountText(4, null, 1, 'metric')).toBe('4 portions')
    expect(batchAmountText(4, 'portion', 2, 'metric')).toBe('8 portions')
    expect(batchAmountText(1, null, 1, 'metric')).toBe('1 portion')
  })
})

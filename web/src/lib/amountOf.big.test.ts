import { describe, expect, it } from 'vitest'
import { amountOf, amountOfText } from './amountOf'

// B9-22 / SSP-16: "x of y" with kg and l. The unit is still written once when both amounts share it.
describe('SSP-16 amountOf with kg and l', () => {
  it('names the unit once when both amounts are in kg or l', () => {
    expect(amountOf(1500, 2000, 'g', 'metric')).toEqual(['1.5', '2 kg'])
    expect(amountOf(1000, 12000, 'g', 'metric')).toEqual(['1', '12 kg'])
    expect(amountOf(1200, 1500, 'ml', 'metric')).toEqual(['1.2', '1.5 l'])
  })

  it('keeps both units when they differ: "800 g of 1.2 kg"', () => {
    expect(amountOf(800, 1200, 'g', 'metric')).toEqual(['800 g', '1.2 kg'])
    expect(amountOfText(800, 1200, 'g', 'metric')).toBe('800 g of 1.2 kg')
    expect(amountOfText(800, 1200, 'g', 'metric', { compact: true })).toBe('800 g/1.2 kg')
    expect(amountOfText(400, 1000, 'ml', 'metric')).toBe('400 ml of 1 l')
  })

  it('an x within float dust of 0 reads a bare 0 (zero is the same in every unit) when y is promoted', () => {
    expect(amountOf(1e-12, 1500, 'g', 'metric')).toEqual(['0', '1.5 kg'])
  })

  it('a grouped number still shares its unit', () => {
    expect(amountOf(1200000, 2400000, 'g', 'metric')).toEqual(['1,200', '2,400 kg'])
  })

  it('pieces are bare numbers, grouped from 1000', () => {
    expect(amountOf(1250, 1500, 'piece', 'metric')).toEqual(['1,250', '1,500'])
    expect(amountOfText(504, 1250, 'piece', 'metric')).toBe('504 of 1,250')
  })

  it('imperial is unchanged', () => {
    expect(amountOf(1000, 2000, 'g', 'imperial')).toEqual(['2 lb 3 oz', '4 lb 7 oz'])
  })
})
